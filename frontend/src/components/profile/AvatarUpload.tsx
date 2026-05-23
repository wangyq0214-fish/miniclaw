'use client';

import { useState, useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';

interface AvatarUploadProps {
  currentAvatar?: string | null;
  onUpload: (avatarData: string, avatarType: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function AvatarUpload({ currentAvatar, onUpload, onDelete }: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      setPreview(base64Data);
      setIsUploading(true);

      try {
        await onUpload(base64Data, file.type);
      } catch (error) {
        console.error('Upload failed:', error);
        alert('上传失败，请重试');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    try {
      await onDelete();
      setPreview(null);
    } catch (error) {
      console.error('Delete failed:', error);
      alert('删除失败，请重试');
    }
  };

  const displayAvatar = preview || currentAvatar;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar Display */}
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt="用户头像"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-4xl">👤</span>
          )}
        </div>

        {/* Upload Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="absolute -bottom-1 -right-1 w-8 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-md transition-colors disabled:opacity-50"
          aria-label="上传头像"
        >
          <Camera size={16} />
        </button>

        {/* Delete Button */}
        {displayAvatar && onDelete && (
          <button
            onClick={handleDelete}
            className="absolute -top-1 -right-1 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
            aria-label="删除头像"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Upload Status */}
      {isUploading && (
        <p className="text-sm text-indigo-600 animate-pulse">上传中...</p>
      )}

      {/* Help Text */}
      <p className="text-xs text-slate-500 text-center">
        支持 JPG、PNG、GIF 格式，最大 2MB
      </p>
    </div>
  );
}
