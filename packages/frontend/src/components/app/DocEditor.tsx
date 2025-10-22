"use client";

import React, { useRef, useState, useEffect } from "react";
import DOMPurify from 'dompurify';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link, Image as ImageIcon,
  Code, Quote, Undo, Redo, Download, Upload, FileText,
  Heading1, Heading2, Table, Minus, Pen, Eraser, Type,
  Palette, Move, Square, Circle, ArrowRight, Trash2
} from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Sanitize HTML content to prevent XSS attacks
 */
function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'i', 'u', 'strong', 'em', 's', 'strike',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'code', 'pre',
      'div', 'span',
      'hr'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'style', 'class', 'id',
      'border', 'cellpadding', 'cellspacing'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false
  });
}

interface EditorFile {
  name: string;
  type: string;
  size: number;
  content: string;
}

export default function DocEditor() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  
  const [currentFile, setCurrentFile] = useState<EditorFile | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [editorMode, setEditorMode] = useState<'document' | 'canvas'>('document');
  
  // Canvas state
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasTool, setCanvasTool] = useState<'pen' | 'eraser' | 'text' | 'rect' | 'circle' | 'arrow'>('pen');
  const [penColor, setPenColor] = useState('#000000');
  const [penSize, setPenSize] = useState(3);
  const [canvasHistory, setCanvasHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  // Update word/char count
  useEffect(() => {
    const updateCounts = () => {
      if (editorRef.current) {
        const text = editorRef.current.innerText || "";
        setCharCount(text.length);
        setWordCount(text.trim().split(/\s+/).filter(w => w.length > 0).length);
      }
    };
    
    const editor = editorRef.current;
    if (editor) {
      editor.addEventListener('input', updateCounts);
      updateCounts();
      return () => editor.removeEventListener('input', updateCounts);
    }
  }, []);

  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }

  function insertHtml(html: string) {
    if (editorRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const temp = document.createElement('div');
        // Sanitize HTML before inserting
        temp.innerHTML = sanitizeHtml(html);
        const frag = document.createDocumentFragment();
        let node;
        while ((node = temp.firstChild)) {
          frag.appendChild(node);
        }
        range.insertNode(frag);
      }
    }
  }

  function insertLink() {
    if (linkUrl) {
      exec('createLink', linkUrl);
      setLinkUrl("");
      setShowLinkDialog(false);
    }
  }

  function insertImage() {
    if (imageUrl) {
      exec('insertImage', imageUrl);
      setImageUrl("");
      setShowImageDialog(false);
    }
  }

  function insertTable() {
    const html = `
      <table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;">
        <thead>
          <tr>
            <th style="padding: 8px; border: 1px solid #ccc;">Header 1</th>
            <th style="padding: 8px; border: 1px solid #ccc;">Header 2</th>
            <th style="padding: 8px; border: 1px solid #ccc;">Header 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 8px; border: 1px solid #ccc;">Cell 1</td>
            <td style="padding: 8px; border: 1px solid #ccc;">Cell 2</td>
            <td style="padding: 8px; border: 1px solid #ccc;">Cell 3</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ccc;">Cell 4</td>
            <td style="padding: 8px; border: 1px solid #ccc;">Cell 5</td>
            <td style="padding: 8px; border: 1px solid #ccc;">Cell 6</td>
          </tr>
        </tbody>
      </table>
    `;
    insertHtml(html);
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    console.log('Import file function called');
    const file = e.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', file.name, file.type, file.size);

    const reader = new FileReader();
    const fileName = file.name;
    const fileType = file.type;
    const fileSize = file.size;

    reader.onload = async (event) => {
      console.log('File loaded, processing...');
      let content = "";
      const result = event.target?.result;

      try {
        // Handle different file types
        if (fileType === "text/html" || fileName.endsWith(".html") || fileName.endsWith(".htm")) {
          content = result as string;
        } 
        else if (fileType === "text/plain" || fileName.endsWith(".txt")) {
          const text = result as string;
          content = `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text)}</pre>`;
        }
        else if (fileName.endsWith(".md") || fileName.endsWith(".markdown")) {
          const text = result as string;
          content = markdownToHtml(text);
        }
        else if (fileType === "application/json" || fileName.endsWith(".json")) {
          const text = result as string;
          const formatted = JSON.stringify(JSON.parse(text), null, 2);
          content = `<pre style="background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto;"><code>${escapeHtml(formatted)}</code></pre>`;
        }
        else if (fileName.endsWith(".csv")) {
          const text = result as string;
          content = csvToHtmlTable(text);
        }
        else if (fileName.endsWith(".xml")) {
          const text = result as string;
          content = `<pre style="background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto;"><code>${escapeHtml(text)}</code></pre>`;
        }
        else if (fileType.startsWith("application/vnd.openxmlformats") || fileName.endsWith(".docx")) {
          content = `<p><strong>📄 DOCX file loaded: ${fileName}</strong></p><p>Note: For full DOCX support, consider using a dedicated library like mammoth.js</p><p>File size: ${formatFileSize(fileSize)}</p>`;
        }
        else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
          content = `<p><strong>📕 PDF file loaded: ${fileName}</strong></p><p>Note: PDF content extraction requires pdf.js library</p><p>File size: ${formatFileSize(fileSize)}</p>`;
        }
        else if (fileType === "application/rtf" || fileName.endsWith(".rtf")) {
          const text = result as string;
          content = `<p><strong>📝 RTF file loaded: ${fileName}</strong></p><pre style="white-space: pre-wrap;">${escapeHtml(text)}</pre>`;
        }
        else {
          // Generic text fallback
          const text = result as string;
          content = `<pre style="white-space: pre-wrap;">${escapeHtml(text)}</pre>`;
        }

        if (editorRef.current) {
          // Sanitize content before setting innerHTML
          editorRef.current.innerHTML = sanitizeHtml(content);
        }

        console.log('File processed successfully, setting content');
        setCurrentFile({
          name: fileName,
          type: fileType,
          size: fileSize,
          content: content
        });
        console.log('Current file state updated');
      } catch (error) {
        console.error("Error parsing file:", error);
        content = `<p style="color: red;">❌ Error loading file: ${fileName}</p><p>Error: ${error}</p>`;
        if (editorRef.current) {
          // Sanitize even error messages
          editorRef.current.innerHTML = sanitizeHtml(content);
        }
      }
    };

    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      alert(`Failed to read file: ${fileName}`);
    };

    // Read as text for most formats
    if (fileType.startsWith("image/")) {
      console.log('Reading image file as data URL');
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        console.log('Image loaded');
        const img = `<img src="${e.target?.result}" alt="${fileName}" style="max-width: 100%; height: auto; display: block; margin: 20px auto;" />`;
        if (editorRef.current) {
          // Sanitize image HTML
          editorRef.current.innerHTML = sanitizeHtml(img);
        }
        setCurrentFile({
          name: fileName,
          type: fileType,
          size: fileSize,
          content: img
        });
      };
    } else {
      console.log('Reading file as text');
      reader.readAsText(file);
    }

    e.currentTarget.value = "";
  }

  function exportFile(format: 'html' | 'txt' | 'md') {
    const content = editorRef.current?.innerHTML || "";
    let blob: Blob;
    let filename: string;
    
    switch (format) {
      case 'html':
        const htmlDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${currentFile?.name || 'Document'}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
        blob = new Blob([htmlDoc], { type: "text/html;charset=utf-8" });
        filename = (currentFile?.name.replace(/\.[^.]*$/, "") || "document") + ".html";
        break;
      
      case 'txt':
        const text = editorRef.current?.innerText || "";
        blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        filename = (currentFile?.name.replace(/\.[^.]*$/, "") || "document") + ".txt";
        break;
      
      case 'md':
        const markdown = htmlToMarkdown(content);
        blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
        filename = (currentFile?.name.replace(/\.[^.]*$/, "") || "document") + ".md";
        break;
      
      default:
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Helper functions
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function markdownToHtml(md: string): string {
    let html = md;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%;" />');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Lists
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
    // Wrap consecutive list items in ul tags
    const listItemRegex = /(<li>.*<\/li>)/;
    if (listItemRegex.test(html)) {
      html = html.replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/g, '<ul>$1</ul>');
    }
    
    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    return html;
  }

  function htmlToMarkdown(html: string): string {
    let md = html;
    
    // Headers
    md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
    
    // Bold
    md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    
    // Italic
    md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    
    // Links
    md = md.replace(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    
    // Images
    md = md.replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
    
    // Lists
    md = md.replace(/<li>(.*?)<\/li>/gi, '* $1\n');
    md = md.replace(/<\/?ul>/gi, '\n');
    md = md.replace(/<\/?ol>/gi, '\n');
    
    // Paragraphs
    md = md.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
    
    // Remove remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');
    
    return md.trim();
  }

  function csvToHtmlTable(csv: string): string {
    const rows = csv.trim().split('\n');
    let html = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;"><thead><tr>';
    
    // Header row
    const headers = rows[0].split(',');
    headers.forEach(header => {
      html += `<th style="padding: 8px; border: 1px solid #ccc; background: #f4f4f4;">${escapeHtml(header.trim())}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].split(',');
      html += '<tr>';
      cells.forEach(cell => {
        html += `<td style="padding: 8px; border: 1px solid #ccc;">${escapeHtml(cell.trim())}</td>`;
      });
      html += '</tr>';
    }
    
    html += '</tbody></table>';
    return html;
  }

  // ========================
  // Canvas Drawing Functions
  // ========================
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 600;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Initial white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Save initial state
    saveCanvasState();
  }, [editorMode]);

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
      a.download = 'drawing.png';
      a.click();
      URL.revokeObjectURL(url);
    });
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
    
    // Draw shapes
    if (canvasTool === 'rect') {
      const startX = ctx.getTransform().e;
      const startY = ctx.getTransform().f;
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.strokeRect(startX, startY, x - startX, y - startY);
    } else if (canvasTool === 'circle') {
      const startX = ctx.getTransform().e;
      const startY = ctx.getTransform().f;
      const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.beginPath();
      ctx.arc(startX, startY, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (canvasTool === 'arrow') {
      const headlen = 15;
      const angle = Math.atan2(y - ctx.getTransform().f, x - ctx.getTransform().e);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - headlen * Math.cos(angle - Math.PI / 6), y - headlen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x, y);
      ctx.lineTo(x - headlen * Math.cos(angle + Math.PI / 6), y - headlen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else if (canvasTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        ctx.fillStyle = penColor;
        ctx.font = `${penSize * 6}px sans-serif`;
        ctx.fillText(text, x, y);
      }
    }
    
    saveCanvasState();
  }

  return (
    <Card className="doc-editor overflow-hidden">
      {/* Mode Tabs */}
      <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as 'document' | 'canvas')} className="w-full">
        <div className="border-b bg-muted/30 px-2 pt-2">
          <TabsList>
            <TabsTrigger value="document">
              <FileText className="h-4 w-4 mr-2" />
              Document Editor
            </TabsTrigger>
            <TabsTrigger value="canvas">
              <Pen className="h-4 w-4 mr-2" />
              Canvas Drawing
            </TabsTrigger>
          </TabsList>
        </div>

        {/* DOCUMENT EDITOR TAB */}
        <TabsContent value="document" className="m-0">
      {/* Toolbar */}
      <div className="border-b bg-muted/30 p-2">
        {/* File info */}
        {currentFile && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-green-500/10 rounded border border-green-500/20">
            <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium truncate text-green-700 dark:text-green-300">
              ✅ Loaded: {currentFile.name}
            </span>
            <Badge variant="secondary" className="text-xs">{formatFileSize(currentFile.size)}</Badge>
          </div>
        )}        {/* Main toolbar */}
        <div className="flex flex-wrap gap-1">
          {/* Text formatting */}
          <div className="flex gap-1 border-r pr-2">
            <Button size="sm" variant="ghost" onClick={() => exec('bold')} title="Bold (Ctrl+B)">
              <Bold className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('italic')} title="Italic (Ctrl+I)">
              <Italic className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('underline')} title="Underline (Ctrl+U)">
              <Underline className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('strikeThrough')} title="Strikethrough">
              <Strikethrough className="h-4 w-4" />
            </Button>
          </div>

          {/* Headers */}
          <div className="flex gap-1 border-r pr-2">
            <Button size="sm" variant="ghost" onClick={() => exec('formatBlock', 'h1')} title="Heading 1">
              <Heading1 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('formatBlock', 'h2')} title="Heading 2">
              <Heading2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Lists */}
          <div className="flex gap-1 border-r pr-2">
            <Button size="sm" variant="ghost" onClick={() => exec('insertUnorderedList')} title="Bullet List">
              <List className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('insertOrderedList')} title="Numbered List">
              <ListOrdered className="h-4 w-4" />
            </Button>
          </div>

          {/* Alignment */}
          <div className="flex gap-1 border-r pr-2">
            <Button size="sm" variant="ghost" onClick={() => exec('justifyLeft')} title="Align Left">
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('justifyCenter')} title="Align Center">
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('justifyRight')} title="Align Right">
              <AlignRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Insert elements */}
          <div className="flex gap-1 border-r pr-2">
            <Button size="sm" variant="ghost" onClick={() => setShowLinkDialog(!showLinkDialog)} title="Insert Link">
              <Link className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowImageDialog(!showImageDialog)} title="Insert Image">
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={insertTable} title="Insert Table">
              <Table className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('insertHorizontalRule')} title="Insert Horizontal Line">
              <Minus className="h-4 w-4" />
            </Button>
          </div>

          {/* Code & Quote */}
          <div className="flex gap-1 border-r pr-2">
            <Button size="sm" variant="ghost" onClick={() => exec('formatBlock', 'pre')} title="Code Block">
              <Code className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('formatBlock', 'blockquote')} title="Quote">
              <Quote className="h-4 w-4" />
            </Button>
          </div>

          {/* Undo/Redo */}
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => exec('undo')} title="Undo (Ctrl+Z)">
              <Undo className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exec('redo')} title="Redo (Ctrl+Y)">
              <Redo className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Secondary toolbar - Import/Export */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-2 pt-2 border-t gap-2">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.html,.htm,.json,.csv,.xml,.rtf,.docx,.pdf,image/*"
              onChange={importFile}
              className="hidden"
              id="file-upload-input"
            />
            <Button 
              size="sm" 
              variant="default" 
              onClick={() => {
                console.log('Import button clicked');
                fileInputRef.current?.click();
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="h-4 w-4 mr-2" /> Import File
            </Button>
            <span className="text-xs text-muted-foreground">
              📁 TXT, MD, HTML, JSON, CSV, XML, RTF, DOCX, PDF, Images
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => exportFile('html')} title="Export as HTML document">
              <Download className="h-4 w-4 mr-2" /> HTML
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportFile('md')} title="Export as Markdown">
              <Download className="h-4 w-4 mr-2" /> MD
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportFile('txt')} title="Export as Plain Text">
              <Download className="h-4 w-4 mr-2" /> TXT
            </Button>
          </div>
        </div>

        {/* Link dialog */}
        {showLinkDialog && (
          <div className="mt-2 p-2 border rounded-lg bg-background">
            <div className="flex gap-2">
              <input
                ref={linkInputRef}
                type="url"
                placeholder="Enter URL..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && insertLink()}
                className="flex-1 px-3 py-1 text-sm border rounded"
              />
              <Button size="sm" onClick={insertLink}>Insert</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Image dialog */}
        {showImageDialog && (
          <div className="mt-2 p-2 border rounded-lg bg-background">
            <div className="flex gap-2">
              <input
                ref={imageInputRef}
                type="url"
                placeholder="Enter image URL..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && insertImage()}
                className="flex-1 px-3 py-1 text-sm border rounded"
              />
              <Button size="sm" onClick={insertImage}>Insert</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowImageDialog(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable={true}
        suppressContentEditableWarning
        className="p-6 min-h-[400px] max-h-[70vh] overflow-y-auto focus:outline-none prose prose-sm dark:prose-invert max-w-none bg-background"
        style={{
          caretColor: 'currentColor',
        }}
        spellCheck="true"
      >
        <h1>📝 Advanced Document Editor</h1>
        <p>✨ <strong>Start typing here or import a file!</strong></p>
        <p>This is a <strong>fully editable</strong> document editor with:</p>
        <ul>
          <li><strong>File Import:</strong> Click "Import" button above to load TXT, Markdown, HTML, JSON, CSV, XML, RTF, DOCX, PDF, Images</li>
          <li><strong>Rich Formatting:</strong> Use toolbar for bold, italic, underline, headers, lists, alignment</li>
          <li><strong>Advanced Features:</strong> Insert links, images, tables, code blocks, quotes</li>
          <li><strong>Export:</strong> Save as HTML, Markdown, or Plain Text</li>
          <li><strong>Canvas Mode:</strong> Switch to Canvas tab above for drawing & signatures</li>
        </ul>
        <p>💡 <em>Try selecting text and using the toolbar buttons!</em></p>
        <p>🎨 <em>Click the "Canvas Drawing" tab to sign documents or draw diagrams.</em></p>
      </div>

      {/* Status bar */}
      <div className="border-t px-4 py-2 bg-muted/30 flex justify-between text-xs text-muted-foreground">
        <div className="flex gap-4">
          <span>Words: {wordCount}</span>
          <span>Characters: {charCount}</span>
        </div>
        <div>
          {currentFile ? `Editing: ${currentFile.name}` : 'New Document'}
        </div>
      </div>
        </TabsContent>

        {/* CANVAS DRAWING TAB */}
        <TabsContent value="canvas" className="m-0">
          {/* Canvas Toolbar */}
          <div className="border-b bg-muted/30 p-2">
            <div className="flex flex-wrap gap-2">
              {/* Drawing Tools */}
              <div className="flex gap-1 border-r pr-2">
                <Button
                  size="sm"
                  variant={canvasTool === 'pen' ? 'default' : 'ghost'}
                  onClick={() => setCanvasTool('pen')}
                  title="Pen"
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

              {/* Shapes */}
              <div className="flex gap-1 border-r pr-2">
                <Button
                  size="sm"
                  variant={canvasTool === 'rect' ? 'default' : 'ghost'}
                  onClick={() => setCanvasTool('rect')}
                  title="Rectangle"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={canvasTool === 'circle' ? 'default' : 'ghost'}
                  onClick={() => setCanvasTool('circle')}
                  title="Circle"
                >
                  <Circle className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={canvasTool === 'arrow' ? 'default' : 'ghost'}
                  onClick={() => setCanvasTool('arrow')}
                  title="Arrow"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Color & Size */}
              <div className="flex items-center gap-3 border-r pr-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Color:</Label>
                  <input
                    type="color"
                    value={penColor}
                    onChange={(e) => setPenColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 min-w-[120px]">
                  <Label className="text-xs">Size:</Label>
                  <Slider
                    value={[penSize]}
                    onValueChange={(v) => setPenSize(v[0])}
                    min={1}
                    max={20}
                    step={1}
                    className="w-16"
                  />
                  <span className="text-xs w-4">{penSize}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={canvasUndo} title="Undo">
                  <Undo className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={canvasRedo} title="Redo">
                  <Redo className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={clearCanvas} title="Clear">
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={downloadCanvas}>
                  <Download className="h-4 w-4 mr-2" /> Save PNG
                </Button>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="p-4 bg-muted/20 flex justify-center">
            <canvas
              ref={canvasRef}
              className="border border-border bg-white rounded shadow-sm cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => setIsDrawing(false)}
              style={{ width: '100%', maxWidth: '900px' }}
            />
          </div>

          {/* Canvas info */}
          <div className="border-t px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
            <p>
              Draw, annotate, sign documents • Use for signatures, diagrams, annotations
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
