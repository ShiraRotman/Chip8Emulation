
const CanvasUpdater=(function()
{
	const privatePropsMap=new WeakMap();
	
	function CanvasUpdater(canvas,observable,color="black")
	{
		if (!(canvas instanceof HTMLCanvasElement))
			throw new TypeError("'canvas' must be a HTML canvas element!");
		if ((!("getWidth" in observable))||(!("getHeight" in observable)))
			throw new TypeError("'observable' must have getWidth/Height functions!");
		if ((!("addEventListener" in observable))||(!("removeEventListener" in observable))||
				(!("dispatchEvent" in observable)))
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
