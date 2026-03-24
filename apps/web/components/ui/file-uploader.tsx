'use client';
import React, { useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface FileUploaderProps {
  accept?: string;
  maxSizeMb?: number;
  onFile: (file: File) => void;
  uploading?: boolean;
  progress?: number;
  label?: string;
}

export function FileUploader({
  accept = '.pdf,image/*',
  maxSizeMb = 50,
  onFile,
  uploading,
  progress,
  label = 'Drop files or click to upload',
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File must be under ${maxSizeMb}MB`);
      return;
    }
    onFile(file);
  };

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
        dragOver ? 'border-gold bg-gold-light' : 'border-gray-300 hover:border-gray-400',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {uploading ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Uploading...</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gold h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-4xl">📎</div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-xs text-gray-400">PDF, JPEG, PNG, TIFF — max {maxSizeMb}MB</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
