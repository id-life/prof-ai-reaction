"use client";

import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface InputSectionProps {
  onTextSubmit: (text: string) => void;
  onFileSubmit: (file: File) => void;
}

export function InputSection({
  onTextSubmit,
  onFileSubmit,
}: InputSectionProps) {
  const [textInput, setTextInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      onTextSubmit(textInput);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      onFileSubmit(file);
    }
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Tabs defaultValue="text" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="text" className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Text Input
        </TabsTrigger>
        <TabsTrigger value="file" className="flex items-center gap-2">
          <Upload className="w-4 h-4" />
          File Upload
        </TabsTrigger>
      </TabsList>

      <TabsContent value="text" className="space-y-4">
        <Textarea
          placeholder="Enter lines of text (will be converted to timed cues)..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          rows={6}
          className="min-h-[120px]"
        />
        <Button
          onClick={handleTextSubmit}
          disabled={!textInput.trim()}
          className="w-full"
        >
          Parse Text
        </Button>
      </TabsContent>

      <TabsContent value="file" className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.vtt"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
          {uploadedFile ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                File selected: {uploadedFile.name}
              </div>
              <div className="text-xs text-muted-foreground">
                Size: {(uploadedFile.size / 1024).toFixed(1)} KB
              </div>
              <Button
                variant="outline"
                onClick={handleFileUploadClick}
                className="w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                Select Different File
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">Upload Subtitle File</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .srt and .vtt formats
                </p>
              </div>
              <Button onClick={handleFileUploadClick} className="w-full">
                <Upload className="w-4 h-4 mr-2" />
                Choose File
              </Button>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
