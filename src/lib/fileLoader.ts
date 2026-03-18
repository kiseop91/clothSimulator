export interface LoadedFile {
  data: ArrayBuffer;
  extension: string;
  name: string;
  size: number;
}

export async function loadFile(file: File): Promise<LoadedFile> {
  const data = await file.arrayBuffer();
  const name = file.name;
  const size = file.size;
  const dotIndex = name.lastIndexOf(".");
  const extension = dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "";

  return { data, extension, name, size };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
