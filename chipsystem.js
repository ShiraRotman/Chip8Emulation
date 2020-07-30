
const CHIP8_DISPLAY_WIDTH=64,CHIP8_DISPLAY_HEIGHT=32;

const Chip8System=(function()
{
	const STACK_POINTER_INDEX=16,DELAY_TIMER_INDEX=17,SOUND_TIMER_INDEX=18,KEY_STORE_INDEX=19;
	const ADDRESS_REG_INDEX=0,PROGRAM_COUNTER_INDEX=1,KEYS_STATE_REG_INDEX=2;

	const PROGRAM_START_ADDRESS=0x200,CPU_CYCLE_MILLIS=2; // 1/500 Hertz
	// 1/60 Hertz = 16.667, rounded down since actual delay may be longer
	const DELAY_INTERVAL_MILLIS=16,SOUND_INTERVAL_MILLIS=16;
	
	const privatePropsMap=new WeakMap();
	
	function Chip8System(keyboardDevice,displayDevice,soundDevice)
	{
		if (new.target===undefined)
			throw new SyntaxError("The 'new' syntax must be used when calling this function!");
		const privateProps=new Object();
		privatePropsMap.set(this,privateProps);
			
		if (!keyboardDevice)
			throw new ReferenceError("You must supply a keyboard input device!");
		if (!(keyboardDevice instanceof KeyboardDevice))
			throw new TypeError("The keyboard input device must inherit from the KeyboardDevice object!");
		privateProps.keyboardDevice=keyboardDevice;
			
		if (!displayDevice)
			throw new ReferenceError("You must supply a display output device!");
		if (!(displayDevice instanceof DisplayDevice))
			throw new TypeError("The display output device must inherit from the DisplayDevice object!");
		privateProps.displayDevice=displayDevice;
			
		if (!soundDevice)
			throw new ReferenceError("You must supply a sound output device!");
		if (!(soundDevice instanceof SoundDevice))
			throw new TypeError("The sound output device must inherit from the KeyboardDevice object!");
		privateProps.soundDevice=soundDevice;
		
		/*16 base registers + stack pointer + delay & sound timers + key store 
		  data for key wait instruction (FX0A)*/
		privateProps.byteRegisters=new Uint8Array(20);
		//Index (address) register + program counter + keys state
		privateProps.wordRegisters=new Uint16Array(3);
		privateProps.callstack=new Uint16Array(32); 
		privateProps.memory=new Uint8Array(0x1000);
		
		privateProps.cpuCycleTimeoutID=0;
		privateProps.delayIntervalID=0; privateProps.soundIntervalID=0;
		privateProps.handleCPUCycle=handleCPUCycle.bind(this);
		privateProps.delayClockTicked=delayClockTicked.bind(this);
		privateProps.soundClockTicked=soundClockTicked.bind(this);
		
		privateProps.keyPressed=keyPressed.bind(this);
		privateProps.keyReleased=keyReleased.bind(this);
		
		if (Uint8Array.prototype.fill===undefined)
			Uint8Array.prototype.fill=Array.prototype.fill;
		privateProps.resetSysState=resetSysState.bind(this);
		privateProps.resetSysState(); privateProps.active=false;
		
		//Fill font set
		privateProps.memory.set([
			0xF0, 0x90, 0x90, 0x90, 0xF0,
			0x20, 0x60, 0x20, 0x20, 0x70,
			0xF0, 0x10, 0xF0, 0x80, 0xF0,
			0xF0, 0x10, 0xF0, 0x10, 0xF0,
			0x90, 0x90, 0xF0, 0x10, 0x10,
			0xF0, 0x80, 0xF0, 0x10, 0xF0,
			0xF0, 0x80, 0xF0, 0x90, 0xF0,
			0xF0, 0x10, 0x20, 0x40, 0x40,
			0xF0, 0x90, 0xF0, 0x90, 0xF0,
			0xF0, 0x90, 0xF0, 0x10, 0xF0,
			0xF0, 0x90, 0xF0, 0x90, 0x90,
			0xE0, 0x90, 0xE0, 0x90, 0xE0,
			0xF0, 0x80, 0x80, 0x80, 0xF0,
			0xE0, 0x90, 0x90, 0x90, 0xE0,
			0xF0, 0x80, 0xF0, 0x80, 0xF0,
			0xF0, 0x80, 0xF0, 0x80, 0x80]);
	}

	Chip8System.prototype.loadProgram=function(programData)
	{
		if ((!Array.isArray(programData))&&(!(programData instanceof ArrayBuffer))&&(typeof(programData)!=="string"))
			throw new TypeError("Invalid program data format! Please supply an array / array buffer / hexadecimal string!");
		
		const privateProps=privatePropsMap.get(this);
		privateProps.resetSysState();
		if (Array.isArray(programData))
			privateProps.memory.set(programData,PROGRAM_START_ADDRESS);
		else if (programData instanceof ArrayBuffer)
		{
			const tempArray=new Uint8Array(programData);
			for (let index=0;index<tempArray.length;index++)
				privateProps.memory[PROGRAM_START_ADDRESS+index]=tempArray[index];
		}
		else //Hexadecimal string
		{
			let address=PROGRAM_START_ADDRESS;
			for (let index=0;index<programData.length;index+=2)
			{
				privateProps.memory[address++]=Number.parseInt(programData.
						substring(index,index+2),16);
			}
		}
		
		privateProps.keyboardDevice.addEventListener("keydown",privateProps.keyPressed);
		privateProps.keyboardDevice.addEventListener("keyup",privateProps.keyReleased);
		privateProps.lastCycleEndTime=0; privateProps.active=true;
		privateProps.cpuCycleTimeoutID=setTimeout(privateProps.handleCPUCycle,0);
	}

	function resetSysState()
	{
		const privateProps=privatePropsMap.get(this);
		privateProps.memory.fill(0,PROGRAM_START_ADDRESS);
		privateProps.byteRegisters.fill(0);
		privateProps.byteRegisters[KEY_STORE_INDEX]=0x10;
		privateProps.wordRegisters[ADDRESS_REG_INDEX]=0;
		privateProps.wordRegisters[KEYS_STATE_REG_INDEX]=0;
		privateProps.wordRegisters[PROGRAM_COUNTER_INDEX]=PROGRAM_START_ADDRESS;
	}
	
	Chip8System.prototype.stop=function(pauseOnly=true)
	{
		if (typeof(pauseOnly)!=="boolean")
			throw new TypeError("'pauseOnly' must be boolean!");
		const privateProps=privatePropsMap.get(this);
		if (privateProps.cpuCycleTimeoutID==0)
		{
			if ((pauseOnly)&&(!privateProps.active))
				throw new Error("Can't pause running a program that's already finished!");
		}
		else
		{
			clearTimeout(privateProps.cpuCycleTimeoutID);
			privateProps.cpuCycleTimeoutID=0;
			if (privateProps.delayIntervalID>0)
			{ 
				clearInterval(privateProps.delayIntervalID); 
				privateProps.delayIntervalID=0;
			}
			if (privateProps.soundIntervalID>0)
			{ 
				clearInterval(privateProps.soundIntervalID);
				privateProps.soundIntervalID=0;
			}
		}
		if (!pauseOnly)
		{
			privateProps.keyboardDevice.removeEventListener("keydown",privateProps.keyPressed);
			privateProps.keyboardDevice.removeEventListener("keyup",privateProps.keyReleased);
			privateProps.active=false;
		}
	}
	
	Chip8System.prototype.resume=function()
	{
		const privateProps=privatePropsMap.get(this);
		if (!privateProps.active)
			throw new Error("Can't resume running a program that's already finished!");
		if (privateProps.cpuCycleTimeoutID>0)
			throw new Error("The program is already running!");
		privateProps.lastCycleEndTime=0;
		privateProps.cpuCycleTimeoutID=setTimeout(privateProps.handleCPUCycle,0);
	}
	
	Chip8System.prototype.isActive=function() 
	{ return privateProps.get(this).active; }
	
	function keyPressed(event)
	{
		const keynum=extractKeyNum(event);
		const privateProps=privatePropsMap.get(this);
		privateProps.wordRegisters[KEYS_STATE_REG_INDEX]|=(1<<keynum);
		const regIndex=privateProps.byteRegisters[KEY_STORE_INDEX];
		if (regIndex<0x10)
		{
			privateProps.byteRegisters[regIndex]=keynum;
			privateProps.byteRegisters[KEY_STORE_INDEX]=0x10;
			this.resume();
		}
	}
	
	function keyReleased(event)
	{
		const keynum=extractKeyNum(event);
		const privateProps=privatePropsMap.get(this);
		privateProps.wordRegisters[KEYS_STATE_REG_INDEX]&=(0xFFFF-(1<<keynum));
	}
	
	function extractKeyNum(event)
	{
		const keynum=event.detail.keynum;
		if (typeof(keynum)!=="number")
		{
			throw new TypeError("The event object must contain a detail object " + 
					"with a numeric 'keynum' property between 0 and 15!");
		}
		if ((keynum<0)||(keynum>15))
			throw new RangeError("The 'keynum' property must be a number between 0 and 15!");
		return keynum;
	}
	
	function handleCPUCycle()
	{
		const cycleStartTime=Date.now(); let numCycles=1,advancePC=true;
		const privateProps=privatePropsMap.get(this);
		let programCounter=privateProps.wordRegisters[PROGRAM_COUNTER_INDEX];
		const instruction=new Uint8Array([privateProps.memory[programCounter],
				privateProps.memory[programCounter+1]]);
		
		console.log(`Now processing: ${instruction[0].toString(16)}${instruction[1].toString(16)}`);
		//Handle specific opcodes
		if (instruction[0]==0x00)
		{
			if (instruction[1]==0xE0) privateProps.displayDevice.clear();
			else if (instruction[1]==0xEE)
				programCounter=privateProps.callstack[--privateProps.byteRegisters[STACK_POINTER_INDEX]];
			else handleInvalidOpcode(instruction);
		}
		//Extract the highest digit to get the instruction's category
		else switch (instruction[0]>>>4)
		{
			/*case 0 needn't be handled since the specific opcodes have already been addressed, and
			  the SYS instruction is not implemented by emulators*/
			case 0x2:
				privateProps.callstack[privateProps.byteRegisters[STACK_POINTER_INDEX]++]=programCounter;
			case 0x1: 
				programCounter=extractAddress(instruction);
				advancePC=false; break;
			case 0x3:
				var regIndex=extractFirstReg(instruction);
				if (privateProps.byteRegisters[regIndex]==instruction[1])
					programCounter+=2;
				break;
			case 0x4:
				regIndex=extractFirstReg(instruction);
				if (privateProps.byteRegisters[regIndex]!=instruction[1])
					programCounter+=2;
				break;
			case 0x5: var equalCompare=true;
			case 0x9:
				if (equalCompare===undefined) equalCompare=false;
				if ((instruction[1]%16)==0)
				{
					const regIndex1=extractFirstReg(instruction);
					const regIndex2=extractSecondReg(instruction);
					if (equalCompare)
					{
						if (privateProps.byteRegisters[regIndex1]==privateProps.
								byteRegisters[regIndex2])
							programCounter+=2;
					}
					else if (privateProps.byteRegisters[regIndex1]!=privateProps.
								byteRegisters[regIndex2])
							programCounter+=2;
				}
				else handleInvalidOpcode(instruction);
				break;
			case 0x6:
				regIndex=extractFirstReg(instruction);
				privateProps.byteRegisters[regIndex]=instruction[1];
				break;
			case 0x7:
				regIndex=extractFirstReg(instruction);
				privateProps.byteRegisters[regIndex]+=instruction[1];
				break;
			case 0xA:
				privateProps.wordRegisters[ADDRESS_REG_INDEX]=extractAddress(
						instruction); break;
			case 0xB:
				programCounter=privateProps.byteRegisters[0]+extractAddress(instruction);
				advancePC=false; break;
			case 0xC:
				const randomNum=Math.floor(Math.random()*256);
				regIndex=extractFirstReg(instruction);
				privateProps.byteRegisters[regIndex]=randomNum & instruction[1];
				break;
			case 0xE:
				regIndex=extractFirstReg(instruction);
				var regValue=privateProps.byteRegisters[regIndex];
				if ((regValue<0)||(regValue>15))
					throw new Error(`Invalid key number in register ${regIndex}: ${regValue}`);
				const keyFlag=1<<regValue;
				if (instruction[1]==0x9E)
				{
					if ((privateProps.wordRegisters[KEYS_STATE_REG_INDEX] & keyFlag)!=0)
						programCounter+=2;
				}
				else if (instruction[1]==0xA1)
				{
					if ((privateProps.wordRegisters[KEYS_STATE_REG_INDEX] & keyFlag)==0)
						programCounter+=2;
				}
				else handleInvalidOpcode(instruction);
				break;
			case 0x8:
				var regIndex1=extractFirstReg(instruction); let wasStored=false;
				var regValue1=privateProps.byteRegisters[regIndex1];
				var regIndex2=extractSecondReg(instruction);
				var regValue2=privateProps.byteRegisters[regIndex2];
				
				switch (instruction[1]%16)
				{
					case 0x0: regValue1=regValue2; break;
					case 0x1: regValue1|=regValue2; break;
					case 0x2: regValue1&=regValue2; break;
					case 0x3: regValue1^=regValue2; break;
					case 0x4:
						regValue1+=regValue2;
						var indicator=(regValue1>0xFF?1:0);
						if (regValue1>0xFF) regValue1&=0xFF;
						break;
					case 0x6: indicator=regValue2%2; regValue1=regValue2>>>1; break;
					case 0xE:
						indicator=(regValue2>0x7F?1:0);
						regValue1=regValue2<<1; regValue1&=0xFF;
						break;
					case 0x5:
						indicator=(regValue1>regValue2?1:0);
						/*Since standard JS variables use more bytes, representation of negative 
						  numbers isn't the same as for the registers, thus direct store is used*/
						privateProps.byteRegisters[regIndex1]-=regValue2;
						wasStored=true; break;
					case 0x7:
						indicator=(regValue2>regValue1?1:0);
						//See previous comment
						privateProps.byteRegisters[regIndex1]=privateProps[regIndex2]-
								privateProps[regIndex1];
						wasStored=true; break;
					default: handleInvalidOpcode(instruction);
				}
				
				if (!wasStored) privateProps.byteRegisters[regIndex1]=regValue1;
				if (indicator!==undefined) privateProps.byteRegisters[0xF]=indicator;
				break;
			case 0xF:
				regIndex=extractFirstReg(instruction);
				switch (instruction[1])
				{
					case 0x7:
						privateProps.byteRegisters[regIndex]=privateProps.
								byteRegisters[DELAY_TIMER_INDEX]; break;
					case 0x1E:
						privateProps.wordRegisters[ADDRESS_REG_INDEX]+=privateProps.
								byteRegisters[regIndex]; break;
					case 0x15:
						privateProps.byteRegisters[DELAY_TIMER_INDEX]=privateProps.byteRegisters[regIndex];
						if ((privateProps.byteRegisters[DELAY_TIMER_INDEX]>0)&&(privateProps.delayIntervalID==0))
						{
							privateProps.delayIntervalID=setInterval(privateProps.
									delayClockTicked,DELAY_INTERVAL_MILLIS);
						}
						break;
					case 0x18:
						privateProps.byteRegisters[SOUND_TIMER_INDEX]=privateProps.byteRegisters[regIndex];
						if ((privateProps.byteRegisters[SOUND_TIMER_INDEX]>0)&&(privateProps.soundIntervalID==0))
						{
							privateProps.soundIntervalID=setInterval(privateProps.
									soundClockTicked,SOUND_INTERVAL_MILLIS);
						}
						break;
					case 0x29:
						var regValue=privateProps.byteRegisters[regIndex];
						if ((regValue<0)||(regValue>15))
							throw new Error(`Invalid key number in register ${regIndex}: ${regValue}`);
						//Each sprite occupies 5 bytes
						privateProps.wordRegisters[ADDRESS_REG_INDEX]=regValue*5;
						break;
					case 0x33:
						regValue=privateProps.byteRegisters[regIndex];
						var address=privateProps.wordRegisters[ADDRESS_REG_INDEX];
						privateProps.memory[address]=Math.floor(regValue/100); regValue%=100;
						privateProps.memory[address+1]=Math.floor(regValue/10); regValue%=10;
						privateProps.memory[address+2]=regValue; break;
					case 0x55:
						address=privateProps.wordRegisters[ADDRESS_REG_INDEX];
						for (let index=0;index<=regIndex;index++)
							privateProps.memory[address++]=privateProps.byteRegisters[index];
						privateProps.wordRegisters[ADDRESS_REG_INDEX]=address;
						break;
					case 0x65:
						address=privateProps.wordRegisters[ADDRESS_REG_INDEX];
						for (let index=0;index<=regIndex;index++)
							privateProps.byteRegisters[index]=privateProps.memory[address++]
						privateProps.wordRegisters[ADDRESS_REG_INDEX]=address;
						break;
					case 0xA:
						privateProps.byteRegisters[KEY_STORE_INDEX]=regIndex;
						this.stop(); break;
					default: handleInvalidOpcode(instruction);
				} //end inner switch
				break;
			case 0xD:
				regIndex1=extractFirstReg(instruction);
				regIndex2=extractSecondReg(instruction);
				regValue1=privateProps.byteRegisters[regIndex1];
				regValue2=privateProps.byteRegisters[regIndex2];
				address=privateProps.wordRegisters[ADDRESS_REG_INDEX];
				
				privateProps.displayDevice.startDraw(); let collided=false;
				for (let size=instruction[1]%16;size>0;size--)
				{
					const spriteRow=privateProps.memory[address++]; 
					let bitmask=0x80;
					do
					{
						if ((spriteRow & bitmask)!=0)
						{
							collided|=privateProps.displayDevice.
									lightPixel(regValue1,regValue2);
						}
						regValue1++; bitmask>>>=1;
						if (regValue1==CHIP8_DISPLAY_WIDTH) regValue1=0;
					} while (bitmask!=0);
					regValue2++;
					if (regValue2==CHIP8_DISPLAY_HEIGHT) regValue2=0;
					regValue1=privateProps.byteRegisters[regIndex1];
				}
								
				privateProps.displayDevice.finishDraw();
				privateProps.byteRegisters[0xF]=(collided?1:0);
				numCycles=10; break;
			default: handleInvalidOpcode(instruction);
		} //end outer switch
		
		if (advancePC)
		{
			programCounter+=2;
			if ((programCounter==0x1000)&&(privateProps.active)) this.stop(false);
		}
		privateProps.wordRegisters[PROGRAM_COUNTER_INDEX]=programCounter;
		
		const cycleEndTime=Date.now();
		if (privateProps.cpuCycleTimeoutID>0)
		{
			let nextCycleTime=CPU_CYCLE_MILLIS-(cycleEndTime-cycleStartTime);
			if (privateProps.lastCycleEndTime>0)
				nextCycleTime-=(cycleStartTime-privateProps.lastCycleEndTime);
			if (numCycles>1)
			{
				nextCycleTime+=(numCycles-1)*CPU_CYCLE_MILLIS;
				privateProps.lastCycleEndTime=0;
			}
			else privateProps.lastCycleEndTime=cycleEndTime;
			if (nextCycleTime<0) nextCycleTime=0;
			privateProps.cpuCycleTimeoutID=setTimeout(privateProps.handleCPUCycle,nextCycleTime);
		}
	} //end handleCPUCycle
	
	//12-bit address, lowest 3 digits
	function extractAddress(instruction) 
	{ return ((instruction[0]%16)*256+instruction[1]); }
	
	//Base registers' indices are always in the middle digits
	function extractFirstReg(instruction) { return (instruction[0]%16); }
	function extractSecondReg(instruction) { return (instruction[1]>>>4); }
	
	function handleInvalidOpcode(instruction)
	{ throw new Error(`Illegal chip-8 opcode: ${instruction[0].toString(16)}${instruction[1].toString(16)}`); }
	
	function delayClockTicked()
	{
		const privateProps=privatePropsMap.get(this);
		privateProps.byteRegisters[DELAY_TIMER_INDEX]--;
		if (privateProps.byteRegisters[DELAY_TIMER_INDEX]==0)
		{
			clearInterval(privateProps.delayIntervalID);
			privateProps.delayIntervalID=0;
		}
	}
	
	function soundClockTicked()
	{
		const privateProps=privatePropsMap.get(this);
		privateProps.byteRegisters[SOUND_TIMER_INDEX]--;
		if (privateProps.byteRegisters[SOUND_TIMER_INDEX]==0)
		{
			privateProps.soundDevice.beep();
			clearInterval(privateProps.soundIntervalID);
			privateProps.soundIntervalID=0;
		}
	}
	
	return Chip8System;
})();
