import { EditorState } from "../types";
import { downloadBlob } from "./exportImage";

export type SaveDestination = "downloads" | "folder";

const EXPORT_PREFS_KEY = "lithania.export.prefs.v1";

export interface ExportPrefs {
  destination: SaveDestination;
}

export function loadExportPrefs(): ExportPrefs {
  try {
    const raw = localStorage.getItem(EXPORT_PREFS_KEY);
    if (raw) return JSON.parse(raw) as ExportPrefs;
  } catch {
    /* ignore */
  }
  return { destination: "downloads" };
}

export function storeExportPrefs(prefs: ExportPrefs) {
  try {
    localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function sanitizeFilename(name: string, fallback = "litany"): string {
  const cleaned = name
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function projectBasename(state: EditorState): string {
  return sanitizeFilename(state.projectName);
}

export function supportsFolderPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function supportsSavePicker(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

async function writeToFolder(
  folder: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob
) {
  const perm = await folder.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    throw new Error("Write permission to the folder was denied.");
  }
  const fileHandle = await folder.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function pickExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFolderPicker()) return null;
  try {
    return await window.showDirectoryPicker!({ mode: "readwrite" });
  } catch {
    return null;
  }
}

export interface SaveBlobOptions {
  destination: SaveDestination;
  folder?: FileSystemDirectoryHandle | null;
  mimeType?: string;
  /** When folder mode has no handle yet, open the directory picker. */
  promptForFolder?: () => Promise<FileSystemDirectoryHandle | null>;
}

/**
 * Save a blob to the chosen destination. Returns false if the user cancelled
 * a picker dialog; throws on hard errors.
 */
export async function saveBlob(
  blob: Blob,
  filename: string,
  options: SaveBlobOptions
): Promise<boolean> {
  const { destination, mimeType } = options;
  let folder = options.folder ?? null;

  if (destination === "folder") {
    if (!folder && options.promptForFolder) {
      folder = await options.promptForFolder();
    }
    if (folder) {
      await writeToFolder(folder, filename, blob);
      return true;
    }
    if (supportsSavePicker()) {
      try {
        const ext = filename.includes(".")
          ? filename.slice(filename.lastIndexOf("."))
          : "";
        const handle = await window.showSaveFilePicker!({
          suggestedName: filename,
          types: mimeType
            ? [
                {
                  description: "File",
                  accept: { [mimeType]: ext ? [ext] : [] },
                },
              ]
            : undefined,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch {
        return false;
      }
    }
  }

  downloadBlob(blob, filename);
  return true;
}
