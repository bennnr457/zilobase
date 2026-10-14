import {
  getFilesLimit,
  serializeDatabaseFiles,
  addDatabaseFile,
  getFilesValue,
  getFileHref,
  getFileLabel,
} from "@zilobase/features/databases";
import { File as FileIcon, Link as LinkIcon, Loader2, Plus, X } from "@/shared/components/icons";
import { useRef, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { getApiErrorMessage } from "@/platform/network/api";
import { uploadPageImage } from "@/platform/network/image-upload";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs";

export function DatabasePropertyFiles({
  editable = true,
  emptyLabel,
  label,
  onOpenChange,
  onSelect,
  workspaceId,
  propertyConfig,
  value,
  pageId,
  databaseId,
}: {
  databaseId?: string | null;
  editable?: boolean;
  emptyLabel?: string;
  label: string;
  onOpenChange?: (open: boolean) => void;
  onSelect: (value: string | string[]) => void;
  workspaceId?: string | null;
  propertyConfig?: unknown;
  value: string | string[];
  pageId?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const filesLimit = getFilesLimit(propertyConfig);
  const files = getFilesValue(value);

  const setOpen = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);

    if (!open) {
      setLinkUrl("");
    }
  };

  const commitFiles = (nextFiles: string[]) => {
    onSelect(serializeDatabaseFiles(nextFiles, filesLimit));
    setOpen(false);
  };

  const addFile = (nextFileValue: string) => {
    const nextFiles = addDatabaseFile(files, nextFileValue, filesLimit);
    if (!nextFiles) return;

    commitFiles(nextFiles);
  };

  const removeFile = (fileValue: string) => {
    const nextFiles = files.filter((file) => file !== fileValue);

    onSelect(serializeDatabaseFiles(nextFiles, filesLimit));
  };

  const readFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setUploadError(null);

    if (file.type.startsWith("image/") && workspaceId && pageId) {
      setIsUploading(true);

      try {
        const uploaded = await uploadPageImage({
          databaseId,
          file,
          workspaceId,
          pageId,
        });

        addFile(uploaded.url);
      } catch (error) {
        setUploadError(getApiErrorMessage(error));
      } finally {
        setIsUploading(false);
      }

      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        addFile(reader.result);
      }
    };

    reader.readAsDataURL(file);
  };

  const submitLink = () => addFile(linkUrl);

  const triggerContent =
    files.length > 0 ? (
      files.map((file) => (
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded-sm bg-surface-canvas px-2 py-0.5 text-xs font-medium leading-4 text-content-primary"
          key={file}
        >
          <FileIcon className="size-3.5 shrink-0" />
          <span className="truncate">{getFileLabel(file)}</span>
        </span>
      ))
    ) : isOpen ? (
      <span className="inline-flex items-center gap-1.5 text-content-secondary">
        <Plus className="size-4 shrink-0" />
        <span>Add a file or image</span>
      </span>
    ) : emptyLabel ? (
      <span className="text-content-secondary">{emptyLabel}</span>
    ) : (
      <span aria-hidden="true" className="block min-h-5 w-full" />
    );

  if (!editable) {
    return files.length > 0 ? (
      <div className="database-select-cell-trigger">
        {files.map((file) => {
          const href = getFileHref(file);

          return (
            <a
              className="inline-flex max-w-full items-center gap-1.5 rounded-sm bg-surface-canvas px-2 py-0.5 text-xs font-medium leading-4 text-content-primary no-underline transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring"
              href={href}
              key={file}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              <FileIcon className="size-3.5 shrink-0" />
              <span className="truncate">{getFileLabel(file)}</span>
            </a>
          );
        })}
      </div>
    ) : (
      <span className="database-select-cell-trigger">
        {emptyLabel ? (
          <span className="text-content-secondary">{emptyLabel}</span>
        ) : (
          <span aria-hidden="true" className="block min-h-5 w-full" />
        )}
      </span>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${label} value`}
          className="database-select-cell-trigger"
          type="button"
        >
          {triggerContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        sideOffset={0}
      >
        <Tabs defaultValue="upload">
          <TabsList className="mx-3 mt-3">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="link">Link</TabsTrigger>
          </TabsList>
          <TabsContent className="space-y-3 p-3" value="upload">
            <div className="space-y-1">
              <div className="text-sm font-medium text-content-primary">Upload</div>
              <div className="text-xs text-content-secondary">
                Choose a file or image for this cell.
              </div>
            </div>
            <Button
              className="w-full"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isUploading ? <Loader2 className="animate-spin" /> : null}
              {isUploading ? "Uploading" : "Choose a file"}
            </Button>
            {uploadError ? (
              <div className="text-sm text-action-danger-text">{uploadError}</div>
            ) : null}
            <input
              className="sr-only"
              onChange={(event) => {
                readFile(event.target.files?.[0]);
                event.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
          </TabsContent>
          <TabsContent className="space-y-3 p-3" value="link">
            <div className="space-y-1">
              <div className="text-sm font-medium text-content-primary">Link</div>
              <div className="text-xs text-content-secondary">Paste a public file URL.</div>
            </div>
            <div className="flex items-center gap-2">
              <LinkIcon className="size-4 shrink-0 text-content-secondary" />
              <Input
                autoComplete="off"
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitLink();
                  }
                }}
                placeholder="Paste file URL..."
                value={linkUrl}
              />
              <Button onClick={submitLink} size="sm" type="button">
                Add
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {files.length > 0 ? (
          <div className="border-t p-2">
            {files.map((file) => {
              const href = getFileHref(file);

              return (
                <div
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-action-neutral-hover"
                  key={file}
                >
                  <a
                    className="flex min-w-0 flex-1 items-center gap-2 text-sm text-content-primary no-underline"
                    href={href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FileIcon className="size-4 shrink-0 text-content-secondary" />
                    <span className="truncate">{getFileLabel(file)}</span>
                  </a>
                  <button
                    aria-label={`Remove ${getFileLabel(file)}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-canvas hover:text-content-primary focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
                    onClick={() => removeFile(file)}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
