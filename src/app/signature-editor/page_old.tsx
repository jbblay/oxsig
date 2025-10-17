"use client";

import * as React from "react";
import * as fabric from "fabric";
import {
  MousePointer,
  Pen,
  Type,
  Square,
  Circle,
  Stamp,
  Trash2,
  Download,
  Upload,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const colors = [
  "#ef4444",
  "#f97316",
  "#84cc16",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export default function SignatureEditorPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = React.useRef<any>(null);
  const [activeTool, setActiveTool] = React.useState("pen");
  const [brushSize, setBrushSize] = React.useState(3);
  const [brushColor, setBrushColor] = React.useState("#3b82f6");
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    if (canvasRef.current && !fabricCanvasRef.current) {
      const canvas = new fabric.Canvas(canvasRef.current, {
        isDrawingMode: true,
        backgroundColor: "rgba(241, 245, 249, 0.8)",
      });
      fabricCanvasRef.current = canvas;
      setIsLoaded(true);

      // Responsive canvas
      const resizeCanvas = () => {
        const container = canvas.wrapperEl?.parentElement;
        if (container) {
          canvas.setDimensions({
            width: container.clientWidth,
            height: container.clientHeight,
          });
        }
      };

      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);

      return () => {
        window.removeEventListener("resize", resizeCanvas);
        canvas.dispose();
      };
    }
  }, []);

  React.useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      canvas.isDrawingMode = activeTool === "pen";
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.width = brushSize;
        canvas.freeDrawingBrush.color = brushColor;
      }
    }
  }, [activeTool, brushSize, brushColor]);

  const addText = () => {
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      const text = new fabric.IText("Type here", {
        left: 100,
        top: 100,
        fill: brushColor,
        fontSize: 40,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      setActiveTool("select");
    }
  };

  const addStamp = () => {
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      const stampText = `SIGNED\n${new Date().toLocaleDateString()}`;
      const text = new fabric.Text(stampText, {
        fontSize: 20,
        fill: 'red',
        textAlign: 'center',
        originX: 'center',
        originY: 'center'
      });

      const rect = new fabric.Rect({
        width: 150,
        height: 60,
        fill: 'transparent',
        stroke: 'red',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center'
      });
      
      const group = new fabric.Group([rect, text], {
        left: 150,
        top: 150,
        angle: -10
      });

      canvas.add(group);
      setActiveTool("select");
    }
  };

  const clearCanvas = () => {
    fabricCanvasRef.current?.clear();
  };

  const downloadSignature = () => {
    const dataURL = fabricCanvasRef.current?.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2,
    });
    if (dataURL) {
      const link = document.createElement("a");
      link.href = dataURL;
      link.download = "signature.png";
      link.click();
    }
  };

  const tools = [
    { id: "select", icon: MousePointer },
    { id: "pen", icon: Pen },
    { id: "text", icon: Type, action: addText },
    { id: "stamp", icon: Stamp, action: addStamp },
  ];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Toolbar */}
      <Card className="w-20 flex flex-col items-center p-2 space-y-2">
        <CardTitle className="text-sm font-medium">Tools</CardTitle>
        {tools.map(tool => (
          <Button
            key={tool.id}
            variant={activeTool === tool.id ? "secondary" : "ghost"}
            size="icon"
            onClick={() => {
              setActiveTool(tool.id);
              tool.action?.();
            }}
            title={tool.id.charAt(0).toUpperCase() + tool.id.slice(1)}
          >
            <tool.icon className="h-5 w-5" />
          </Button>
        ))}
        <div className="pt-4 border-t w-full" />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" title="Color">
              <Palette className="h-5 w-5" style={{ color: brushColor }} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-4 gap-1">
              {colors.map(color => (
                <Button
                  key={color}
                  size="icon"
                  className="h-8 w-8"
                  style={{ backgroundColor: color }}
                  onClick={() => setBrushColor(color)}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="pt-4 border-t w-full" />
        <Button variant="ghost" size="icon" onClick={clearCanvas} title="Clear">
          <Trash2 className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={downloadSignature} title="Download">
          <Download className="h-5 w-5" />
        </Button>
      </Card>

      {/* Canvas Area */}
      <div className="flex-1 flex flex-col">
        <Card className="flex-1 relative">
          <canvas ref={canvasRef} />
        </Card>
        {activeTool === 'pen' && (
          <Card className="mt-2">
            <CardContent className="p-3">
              <label className="text-sm font-medium">Brush Size: {brushSize}px</label>
              <Slider
                min={1}
                max={20}
                step={1}
                value={[brushSize]}
                onValueChange={(value) => setBrushSize(value[0])}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
