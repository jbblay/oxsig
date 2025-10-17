"use client";

import React, { useRef, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pen, Eraser, Type, Square, Circle, ArrowRight, Trash2,
  Download, Upload, Save, Palette, Undo, Redo, ImageIcon,
  Sparkles, FileSignature, Copy, Stamp, Check
} from "lucide-react";
import { toast } from "sonner";

interface SavedSignature {
  id: string;
  name: string;
  data: string;
  createdAt: Date;
}

export default function SignatureEditorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [canvasTool, setCanvasTool] = React.useState<'pen' | 'eraser' | 'text'>('pen');
  const [penColor, setPenColor] = React.useState('#000000');
  const [penSize, setPenSize] = React.useState(3);
  const [canvasHistory, setCanvasHistory] = React.useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = React.useState(-1);
  const [savedSignatures, setSavedSignatures] = React.useState<SavedSignature[]>([]);
  const [signatureName, setSignatureName] = React.useState('');

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 400;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initial white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save initial state
    saveCanvasState();

    // Load saved signatures from localStorage
    const saved = localStorage.getItem('oxsig_signatures');
    if (saved) {
      setSavedSignatures(JSON.parse(saved));
    }
  }, []);

  function getCanvasContext() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }

  function saveCanvasState() {
    const ctx = getCanvasContext();
    if (!ctx || !canvasRef.current) return;

    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    const newHistory = canvasHistory.slice(0, historyStep + 1);
    newHistory.push(imageData);
    setCanvasHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }

  function canvasUndo() {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      setHistoryStep(newStep);
      const ctx = getCanvasContext();
      if (ctx) {
        ctx.putImageData(canvasHistory[newStep], 0, 0);
      }
    }
  }

  function canvasRedo() {
    if (historyStep < canvasHistory.length - 1) {
      const newStep = historyStep + 1;
      setHistoryStep(newStep);
      const ctx = getCanvasContext();
      if (ctx) {
        ctx.putImageData(canvasHistory[newStep], 0, 0);
      }
    }
  }

  function clearCanvas() {
    const ctx = getCanvasContext();
    if (!ctx || !canvasRef.current) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    saveCanvasState();
  }

  function downloadCanvas() {
    if (!canvasRef.current) return;

    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signature-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Signature downloaded!');
    });
  }

  function saveSignature() {
    if (!canvasRef.current) return;
    if (!signatureName.trim()) {
      toast.error('Please enter a signature name');
      return;
    }

    const dataUrl = canvasRef.current.toDataURL('image/png');
    const newSignature: SavedSignature = {
      id: Date.now().toString(),
      name: signatureName,
      data: dataUrl,
      createdAt: new Date()
    };

    const updated = [...savedSignatures, newSignature];
    setSavedSignatures(updated);
    localStorage.setItem('oxsig_signatures', JSON.stringify(updated));
    setSignatureName('');
    toast.success('Signature saved!', {
      description: `"${newSignature.name}" saved to your library`
    });
  }

  function loadSignature(signature: SavedSignature) {
    const ctx = getCanvasContext();
    if (!ctx || !canvasRef.current) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      ctx.drawImage(img, 0, 0);
      saveCanvasState();
      toast.success('Signature loaded!');
    };
    img.src = signature.data;
  }

  function deleteSignature(id: string) {
    const updated = savedSignatures.filter(s => s.id !== id);
    setSavedSignatures(updated);
    localStorage.setItem('oxsig_signatures', JSON.stringify(updated));
    toast.info('Signature deleted');
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    setIsDrawing(true);
    const ctx = getCanvasContext();
    if (!ctx) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);

    if (canvasTool === 'pen') {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else if (canvasTool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = penSize * 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const ctx = getCanvasContext();
    if (!ctx) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (canvasTool === 'pen' || canvasTool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    setIsDrawing(false);

    const ctx = getCanvasContext();
    if (!ctx || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (canvasTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        ctx.fillStyle = penColor;
        ctx.font = `${penSize * 6}px cursive`;
        ctx.fillText(text, x, y);
      }
    }

    saveCanvasState();
  }

  const colors = [
    '#000000', '#1e40af', '#dc2626', '#16a34a', '#9333ea',
    '#ea580c', '#0891b2', '#db2777', '#65a30d', '#7c2d12'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
          ✍️ Signature Editor
        </h1>
        <p className="text-muted-foreground mt-1">
          Create, save, and manage your digital signatures
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Canvas Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Toolbar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                {/* Tools */}
                <div className="flex gap-1 border-r pr-3">
                  <Button
                    size="sm"
                    variant={canvasTool === 'pen' ? 'default' : 'ghost'}
                    onClick={() => setCanvasTool('pen')}
                    title="Pen Tool"
                  >
                    <Pen className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={canvasTool === 'eraser' ? 'default' : 'ghost'}
                    onClick={() => setCanvasTool('eraser')}
                    title="Eraser"
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={canvasTool === 'text' ? 'default' : 'ghost'}
                    onClick={() => setCanvasTool('text')}
                    title="Text"
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                </div>

                {/* Color Picker */}
                <div className="flex items-center gap-2 border-r pr-3">
                  <Label className="text-xs">Color:</Label>
                  <div className="flex gap-1">
                    {colors.map((color) => (
                      <button
                        key={color}
                        className={`w-6 h-6 rounded border-2 transition-all ${
                          penColor === color ? 'border-primary scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setPenColor(color)}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                {/* Size Slider */}
                <div className="flex items-center gap-3 border-r pr-3 min-w-[140px]">
                  <Label className="text-xs whitespace-nowrap">Size:</Label>
                  <Slider
                    value={[penSize]}
                    onValueChange={(v) => setPenSize(v[0])}
                    min={1}
                    max={20}
                    step={1}
                    className="w-20"
                  />
                  <span className="text-xs w-4">{penSize}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={canvasUndo}
                    disabled={historyStep <= 0}
                    title="Undo"
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={canvasRedo}
                    disabled={historyStep >= canvasHistory.length - 1}
                    title="Redo"
                  >
                    <Redo className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearCanvas} title="Clear">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Canvas */}
          <Card>
            <CardContent className="p-6">
              <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full cursor-crosshair"
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={() => setIsDrawing(false)}
                  style={{ touchAction: 'none' }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                ✍️ Draw your signature above • Use pen tool for natural signatures
              </p>
            </CardContent>
          </Card>

          {/* Save Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Save Signature</CardTitle>
              <CardDescription>Give your signature a name to save it for later use</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., 'Professional Signature' or 'Initials'"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && saveSignature()}
                />
                <Button onClick={saveSignature} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={downloadCanvas}>
                  <Download className="h-4 w-4" />
                  Download PNG
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={() => {
                  if (canvasRef.current) {
                    canvasRef.current.toBlob((blob) => {
                      if (blob) {
                        navigator.clipboard.write([
                          new ClipboardItem({ 'image/png': blob })
                        ]);
                        toast.success('Signature copied to clipboard!');
                      }
                    });
                  }
                }}>
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Saved Signatures */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                Saved Signatures
              </CardTitle>
              <CardDescription>
                {savedSignatures.length === 0
                  ? 'No signatures saved yet'
                  : `${savedSignatures.length} signature${savedSignatures.length > 1 ? 's' : ''} in library`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {savedSignatures.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Draw and save your first signature!</p>
                </div>
              ) : (
                savedSignatures.map((sig) => (
                  <Card key={sig.id} className="overflow-hidden hover:bg-accent/50 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{sig.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sig.createdAt).toLocaleDateString()}
                          </p>
                          <div className="mt-2 border rounded p-2 bg-white">
                            <img
                              src={sig.data}
                              alt={sig.name}
                              className="w-full h-16 object-contain"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => loadSignature(sig)}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Load
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = sig.data;
                            a.download = `${sig.name}.png`;
                            a.click();
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteSignature(sig.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">💡 Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p>Use a larger pen size (10-15) for natural-looking signatures</p>
              </div>
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p>Save multiple versions (formal, casual, initials)</p>
              </div>
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p>Use black (#000000) for professional documents</p>
              </div>
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p>Practice on the canvas - use undo if needed</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
