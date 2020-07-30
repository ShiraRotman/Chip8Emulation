
function SoundDevice() { }
SoundDevice.prototype.beep=function() { }

function KeyboardDevice()
{
	if (!this)
		throw new ReferenceError("This function must be called for an object!");
	EventTarget.call(this);
}

KeyboardDevice.prototype=Object.create(EventTarget.prototype);
KeyboardDevice.prototype.constructor=KeyboardDevice;

KeyboardDevice.createKeyEvent=function(keynum,isdown)
{
	if (typeof(isdown)!=="boolean")
		throw new TypeError("'isdown' must be a boolean!");
	if (typeof(keynum)!=="number")
		throw new TypeError("'keynum' must be a number between 0 and 15!");
	if ((keynum<0)||(keynum>15))
		throw new RangeError("'keynum' must be a number between 0 and 15!");
	
	return new CustomEvent(isdown?"keydown":"keyup",{detail: {keynum: keynum}});
}

const DisplayDevice=(function()
{
	const privatePropsMap=new WeakMap();
	
	function DisplayDevice()
	{
		if (!this)
			throw new ReferenceError("This function must be called for an object!");
		initDisplayDevice.call(this,CHIP8_DISPLAY_WIDTH,CHIP8_DISPLAY_HEIGHT);
	}
	
	//For future dynamics
	function initDisplayDevice(width,height)
	{
		if ((!Number.isInteger(width))||(!Number.isInteger(height)))
			throw new TypeError("The display dimensions must be natural numbers!");
		if ((width<=0)||(height<=0))
			throw new RangeError(`The display dimensions must be natural numbers! You supplied: ${width},${height}`);
		
		const privateProps={width: width, height: height};
		privatePropsMap.set(this,privateProps);		
	}
	
	DisplayDevice.prototype.getWidth=function() 
	{ return privatePropsMap.get(this).width; }
	
	DisplayDevice.prototype.getHeight=function()
	{ return privatePropsMap.get(this).height; }
	
	DisplayDevice.prototype.clear=function() { }
	DisplayDevice.prototype.startDraw=function() { }
	DisplayDevice.prototype.finishDraw=function() { }
	
	DisplayDevice.prototype.lightPixel=function(x,y)
	{
		if ((!Number.isInteger(x))||(!Number.isInteger(y)))
			throw new TypeError("The display coordinates must be natural numbers or 0s!");
		const width=this.getWidth();
		if ((x<0)||(x>=width))
			throw new RangeError(`The X coordinate must be between 0 and ${width}! You supplied: ${x}`);
		const height=this.getHeight();
		if ((y<0)||(y>=height))
			throw new RangeError(`The Y coordinate must be between 0 and ${height}! You supplied: ${y}`);
		
		return false; //This object doesn't track lit pixels
	}
	
	return DisplayDevice;
})();

const DRAW_EVENT_TYPE="draw",CLEAR_EVENT_TYPE="clear";

const MatrixDisplay=(function()
{
	const privatePropsMap=new WeakMap();
	
	function MatrixDisplay()
	{
		DisplayDevice.call(this); EventTarget.call(this);
		const matrix=new Array(CHIP8_DISPLAY_HEIGHT);
		for (let index=0;index<matrix.length;index++)
		{
			matrix[index]=new Array(CHIP8_DISPLAY_WIDTH);
			matrix[index].fill(false);
		}
		privatePropsMap.set(this,{matrix: matrix});
	}
	
	MatrixDisplay.prototype=Object.create(DisplayDevice.prototype);
	MatrixDisplay.prototype.constructor=MatrixDisplay;
	Object.assign(MatrixDisplay.prototype,EventTarget.prototype);
	
	MatrixDisplay.prototype.clear=function()
	{
		const privateProps=privatePropsMap.get(this),matrix=privateProps.matrix;
		for (let index=0;index<matrix.length;index++)
			matrix[index].fill(false);
		this.dispatchEvent(new CustomEvent(CLEAR_EVENT_TYPE));
	}
	
	MatrixDisplay.prototype.startDraw=function()
	{
		const privateProps=privatePropsMap.get(this);
		privateProps.litPixels=[]; privateProps.clrPixels=[];
	}
	
	MatrixDisplay.prototype.lightPixel=function(x,y)
	{
		//TODO: throw IllegalState
		DisplayDevice.call(this,x,y); const pixel={x: x, y: y};
		const privateProps=privatePropsMap.get(this),matrix=privateProps.matrix;
		const collided=matrix[y][x]; matrix[y][x]=!matrix[y][x];
		if (collided) privateProps.clrPixels.push(pixel);
		else privateProps.litPixels.push(pixel);
		return collided;
	}
	
	MatrixDisplay.prototype.finishDraw=function()
	{
		const privateProps=privatePropsMap.get(this);
		const detail=
		{
			litPixels: privateProps.litPixels,
			clrPixels: privateProps.clrPixels
		};
		this.dispatchEvent(new CustomEvent(DRAW_EVENT_TYPE,{detail: detail}));
	}
	
	return MatrixDisplay;
})();
