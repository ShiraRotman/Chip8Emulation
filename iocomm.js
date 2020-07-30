
const CanvasUpdater=(function()
{
	const privatePropsMap=new WeakMap();
	
	function CanvasUpdater(canvas,observable,color="black")
	{
		if (!(canvas instanceof HTMLCanvasElement))
			throw new TypeError("'canvas' must be a HTML canvas element!");
		if ((!("getWidth" in observable))||(!("getHeight" in observable)))
			throw new TypeError("'observable' must have getWidth/Height functions!");
		if (!isEventTarget(observable))
			throw new TypeError("'observable' must implement the EventTarget interface!");
		if (typeof(color)!=="string")
			throw new TypeError("'color' must be a string!");
		
		const privateProps={canvas: canvas, observable: observable, color: color};
		privateProps.clearCanvas=clearCanvas.bind(this);
		privateProps.drawOnCanvas=drawOnCanvas.bind(this);
		observable.addEventListener(CLEAR_EVENT_TYPE,privateProps.clearCanvas);
		observable.addEventListener(DRAW_EVENT_TYPE,privateProps.drawOnCanvas);
		privatePropsMap.set(this,privateProps);
	}
	
	function clearCanvas()
	{
		const privateProps=privatePropsMap.get(this),canvas=privateProps.canvas;
		canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height);
	}
	
	function drawOnCanvas(event)
	{
		const litPixels=event.detail.litPixels,clrPixels=event.detail.clrPixels;
		if ((litPixels)&&(!Array.isArray(litPixels))||(clrPixels)&&(!Array.isArray(clrPixels)))
			throw new TypeError("The pixel properties must both be arrays of coordinates!");
		if (!litPixels && !clrPixels) return;
		
		const privateProps=privatePropsMap.get(this),canvas=privateProps.canvas;
		const pixelRatioX=Math.floor(canvas.width/privateProps.observable.getWidth());
		const pixelRatioY=Math.floor(canvas.height/privateProps.observable.getHeight());
		const context=canvas.getContext("2d"); context.fillStyle=privateProps.color;
				
		if (litPixels)
		{
			for (let pixel of litPixels)
			{
				const startX=pixel.x*pixelRatioX,startY=pixel.y*pixelRatioY;
				context.fillRect(startX,startY,pixelRatioX,pixelRatioY);
			}
		}
		
		if (clrPixels)
		{
			for (let pixel of clrPixels)
			{
				const startX=pixel.x*pixelRatioX,startY=pixel.y*pixelRatioY;
				context.clearRect(startX,startY,pixelRatioX,pixelRatioY);
			}
		}
	}
	
	return CanvasUpdater;
})();

const KeyboardMappingDevice=(function()
{
	const privatePropsMap=new WeakMap();
	
	function KeyboardMappingDevice(observable)
	{
		KeyboardDevice.call(this);
		if (!isEventTarget(observable))
			throw new TypeError("'observable' must implement the EventTarget interface!");
		
		observable.addEventListener("keydown",keyPressed.bind(this));
		observable.addEventListener("keyup",keyReleased.bind(this));
		const privateProps=new Object();
		
		//TODO: Add functions for changing the default mapping
		privateProps.keymapping=
		{
			"0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
			"8": 8, "9": 9, ".": 10, ",": 10, "/": 11, "*": 12, "-": 13,
			"+": 14, "Enter": 15, "End": 1, "ArrowDown": 2, "PageDown": 3,
			"ArrowLeft": 4, "ArrowRight": 6, "Home": 7, "ArrowUp": 8, 
			"PageUp": 9, "Decimal": 10, "Divide": 11, "Multiply": 12,
			"Subtract": 13, "Add": 14
		};
		privatePropsMap.set(this,privateProps);
	}
	
	KeyboardMappingDevice.prototype=Object.create(KeyboardDevice.prototype);
	KeyboardMappingDevice.prototype.constructor=KeyboardMappingDevice;
	
	function keyPressed(event) { handleKeyEvent.call(this,event,true); };
	function keyReleased(event) { handleKeyEvent.call(this,event,false); };
	
	function handleKeyEvent(event,isdown)
	{
		const privateProps=privatePropsMap.get(this);
		if (event.key in privateProps.keymapping)
		{
			const keynum=privateProps.keymapping[event.key];
			const keyEvent=KeyboardDevice.createKeyEvent(keynum,isdown);
			this.dispatchEvent(keyEvent);
		}
	}
	
	return KeyboardMappingDevice;
})();
