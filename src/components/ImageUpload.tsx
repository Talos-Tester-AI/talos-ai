import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { uploadImage } from '../api/client';

interface ImageUploadProps {
    projectId: string;
    value?: string; // This is the image ID
    onChange: (imageId: string) => void;
    className?: string;
}

export const ImageUpload = ({ projectId, value, onChange, className }: ImageUploadProps) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await uploadImage(projectId, file);
            onChange(response.data._id);
        } catch (err) {
            console.error('Upload failed:', err);
            setError('Failed to upload image');
        } finally {
            setLoading(false);
            // Reset input so same file can be selected again if needed
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const clearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
    };

    return (
        <div className={className}>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
            />

            {value ? (
                <div className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50 h-32 w-full flex items-center justify-center">
                    <img
                        src={`/api/images/${value}`}
                        alt="Expected result"
                        className="max-h-full max-w-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-white rounded-full hover:bg-gray-100 text-gray-700"
                            title="Replace Image"
                            type="button"
                        >
                            <Upload size={16} />
                        </button>
                        <button
                            onClick={clearImage}
                            className="p-2 bg-white rounded-full hover:bg-red-50 text-red-600"
                            title="Remove Image"
                            type="button"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors h-32 flex flex-col items-center justify-center ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
                        }`}
                >
                    {loading ? (
                        <Loader2 size={24} className="animate-spin text-indigo-500" />
                    ) : (
                        <>
                            <ImageIcon size={24} className={error ? "text-red-400" : "text-gray-400"} />
                            <span className={`text-sm mt-2 ${error ? "text-red-600" : "text-gray-500"}`}>
                                {error || "Click to upload expected image"}
                            </span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
