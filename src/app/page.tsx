"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type UploadedImage = {
  id: string;
  file: File;
  url: string;
  product: string;
  expiryDate: string; // YYYY-MM-DD
  status: "Valid" | "Expiring Soon" | "Expired";
  extractedText?: string;
  isExtracting?: boolean;
};

function computeStatus(dateISO: string): UploadedImage["status"] {
  const today = new Date();
  const target = new Date(dateISO);
  if (isNaN(target.getTime())) return "Valid";
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Expired";
  if (diffDays <= 30) return "Expiring Soon";
  return "Valid";
}

export default function Home() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isWaitingForCamera, setIsWaitingForCamera] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const onFilesSelected = useCallback((filesList: FileList | null) => {
    if (!filesList) return;
    // Limit each upload action to 10 files, but allow multiple uploads overall
    const incoming = Array.from(filesList).slice(0, 10);
    const base = images.length;
    const nextItems: UploadedImage[] = incoming.map((file, idx) => {
      const url = URL.createObjectURL(file);
      // Placeholder continues from current total so subsequent batches don't restart at 1
      const placeholderName = `product_${base + idx + 1}`;
      return {
        id: `${Date.now()}-${idx}`,
        file,
        url,
        product: placeholderName,
        expiryDate: "",
        status: "Valid",
      };
    });
    setImages((prev) => [...prev, ...nextItems]);
    // Analyze newly added images
    void analyzeBatch(nextItems);
  }, [images.length]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onFilesSelected(e.dataTransfer.files);
  }, [onFilesSelected]);

  const handleBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return images;
    return images.filter((img) => img.product.toLowerCase().includes(term));
  }, [images, search]);

  const counts = useMemo(() => {
    return {
      total: images.length,
      expiring: images.filter((i) => i.status === "Expiring Soon").length,
      valid: images.filter((i) => i.status === "Valid").length,
      expired: images.filter((i) => i.status === "Expired").length,
    };
  }, [images]);

  const downloadCSV = useCallback(() => {
    const headers = ["Image", "Product", "Expiry Date", "Status"];
    const rows = images.map((i) => [i.file.name, i.product, i.expiryDate, i.status]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expiry-results.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [images]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const toRemove = prev.find((i) => i.id === id);
      if (toRemove) {
        try { URL.revokeObjectURL(toRemove.url); } catch { }
      }
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  async function analyzeBatch(batch: UploadedImage[]) {
    setIsAnalyzing(true);
    try {
      const updates = await Promise.all(batch.map(async (item, index) => {
        const form = new FormData();
        form.append("image", item.file);
        // pass current inline edits (if any) to help the model
        form.append("manualProduct", item.product || "");
        form.append("manualDate", item.expiryDate || "");
        const res = await fetch("/api/analyze", { method: "POST", body: form });
        if (!res.ok) return null;
        const data = await res.json() as { product?: string; expiryDate?: string };
        const name = data.product && data.product.trim().length > 0 ? data.product.trim() : item.product;
        const expiry = data.expiryDate && data.expiryDate.length > 0 ? data.expiryDate : item.expiryDate;
        return {
          id: item.id,
          product: name,
          expiryDate: expiry,
          status: computeStatus(expiry),
        };
      }));

      setImages((prev) => prev.map((img) => {
        const u = updates.find((x) => x && x.id === img.id);
        return u ? { ...img, product: u.product, expiryDate: u.expiryDate, status: u.status } : img;
      }));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function extractTextFromImage(imageItem: UploadedImage) {
    // Mark as extracting
    setImages((prev) => prev.map((img) =>
      img.id === imageItem.id ? { ...img, isExtracting: true } : img
    ));

    try {
      const form = new FormData();
      form.append("image", imageItem.file);

      const res = await fetch("/api/extract-text", { method: "POST", body: form });

      if (!res.ok) {
        throw new Error(`Failed to extract text: ${res.statusText}`);
      }

      const data = await res.json() as { extractedText?: string };
      const extractedText = data.extractedText || "No text detected";

      // Update with extracted text
      setImages((prev) => prev.map((img) =>
        img.id === imageItem.id
          ? { ...img, extractedText, isExtracting: false }
          : img
      ));
    } catch (error) {
      console.error('Text extraction error:', error);
      // Update with error message
      setImages((prev) => prev.map((img) =>
        img.id === imageItem.id
          ? { ...img, extractedText: "Error extracting text", isExtracting: false }
          : img
      ));
    }
  }

  const handleCameraClick = useCallback(async () => {
    try {
      setIsWaitingForCamera(true);

      // Create session
      const res = await fetch('/api/session', { method: 'POST' });
      const data = await res.json();

      setCurrentSessionId(data.sessionId);

      // Open Flutter app via deep link
      window.location.href = data.deepLink;

      // Start polling for images
      let pollCount = 0;
      const maxPolls = 60; //Poll for 1 minute (every second)

      pollingIntervalRef.current = setInterval(async () => {
        pollCount++;

        if (pollCount > maxPolls) {
          // Timeout
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          setIsWaitingForCamera(false);
          setCurrentSessionId(null);
          return;
        }

        try {
          const sessionRes = await fetch(`/api/session/${data.sessionId}`);
          const sessionData = await sessionRes.json();

          if (sessionData.images && sessionData.images.length > 0) {
            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }

            // Convert base64 images to files and add to state
            const newImages: UploadedImage[] = sessionData.images.map((img: any, idx: number) => {
              // Convert base64 to blob
              const byteString = atob(img.data);
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: img.contentType });
              const file = new File([blob], img.filename, { type: img.contentType });
              const url = URL.createObjectURL(blob);

              return {
                id: `${Date.now()}-${idx}`,
                file,
                url,
                product: `product_${images.length + idx + 1}`,
                expiryDate: "",
                status: "Valid",
              };
            });

            setImages((prev) => [...prev, ...newImages]);
            setIsWaitingForCamera(false);
            setCurrentSessionId(null);

            // Extract text from new images
            newImages.forEach((img) => {
              void extractTextFromImage(img);
            });

            // Analyze new images
            void analyzeBatch(newImages);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 1000); // Poll every second

    } catch (error) {
      console.error('Camera error:', error);
      setIsWaitingForCamera(false);
      setCurrentSessionId(null);
    }
  }, [images.length]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen w-full soft-gradient bg-fixed p-6 sm:p-10">
      <div className="mx-auto max-w-7xl rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-6 sm:p-10 text-white shadow-2xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-xl sm:text-2xl font-semibold">Expiry Date Analyzer</h1>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Left Panel - 35% */}
          <section className="md:w-[35%] w-full">
            <h2 className="text-2xl font-semibold mb-4">Upload</h2>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="rounded-xl border border-white/25 bg-white/10 backdrop-blur-lg p-6 text-center shadow-lg"
            >
              <div className="h-48 grid place-items-center rounded-lg border border-dashed border-white/30 bg-white/5">
                <p className="max-w-[18rem] text-white/90">Drag and drop images here</p>
              </div>
              <div className="mt-5 flex gap-3 justify-center flex-wrap">
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-white/20 text-white px-5 font-medium shadow hover:bg-white/30 backdrop-blur transition-colors"
                >
                  Browse
                </button>
                <button
                  type="button"
                  onClick={handleCameraClick}
                  disabled={isWaitingForCamera}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-white px-5 font-medium shadow hover:from-purple-500/40 hover:to-pink-500/40 backdrop-blur transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 3H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {isWaitingForCamera ? 'Waiting...' : 'Camera'}
                </button>
                <p className="mt-2 text-sm text-white/80 w-full">Up to 10 images</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onFilesSelected(e.target.files)}
              />
            </div>

            {images.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-4 overflow-y-auto no-scrollbar styled-scrollbar md:max-h-[68vh] pr-1">
                {images.map((img) => (
                  <div key={img.id} className="relative size-24 overflow-hidden rounded-lg border border-white/20 bg-white/10 backdrop-blur">
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => removeImage(img.id)}
                      className="absolute left-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      {/* Trash icon */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 3H15M4 7H20M18 7L17.2 19.2C17.08 20.86 15.72 22 14.05 22H9.95C8.28 22 6.92 20.86 6.8 19.2L6 7M10 11V18M14 11V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.product} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Right Panel - 65% */}
          <section className="md:w-[65%] w-full">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Results</h2>
              <div className="text-sm text-white/85">
                {counts.total} images uploaded — {counts.expiring} expiring soon, {counts.valid} valid{counts.expired ? `, ${counts.expired} expired` : ""}
              </div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-lg p-4 sm:p-6 flex flex-col md:h-[72vh] shadow-lg">
              <div className="mb-4 flex items-center justify-between gap-3 shrink-0">
                <div className="relative w-60 max-w-full">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    className="w-full rounded-md border border-white/20 bg-white/10 px-9 py-2 placeholder-white/70 outline-none focus:ring-2 focus:ring-white/30 backdrop-blur"
                  />
                  <span className="absolute left-3 top-2.5 text-white/80">🔍</span>
                </div>
                <button
                  onClick={downloadCSV}
                  className="rounded-md bg-white/20 text-white px-4 py-2 text-sm font-medium shadow hover:bg-white/30 backdrop-blur"
                >
                  Download CSV
                </button>
                {isAnalyzing && (
                  <span className="ml-3 text-xs text-white/80">Analyzing...</span>
                )}
              </div>
              <div className="overflow-x-auto overflow-y-auto no-scrollbar styled-scrollbar flex-1">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/80">
                      <th className="py-2 pr-4 font-medium">Image</th>
                      <th className="py-2 pr-4 font-medium">Product</th>
                      <th className="py-2 pr-4 font-medium">Expiry Date</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Extracted Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((img) => (
                      <tr key={img.id} className="border-t border-white/10">
                        <td className="py-3 pr-4">
                          <div className="size-12 overflow-hidden rounded-md border border-white/20 bg-white/10 backdrop-blur">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url} alt={img.product} className="h-full w-full object-cover" />
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-middle">
                          <div className="text-white/95">{img.product}</div>
                        </td>
                        <td className="py-3 pr-4 align-middle">
                          <div className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white/90 backdrop-blur">
                            {img.expiryDate || "-"}
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-middle">
                          <span
                            className={
                              img.status === "Valid"
                                ? "inline-flex items-center rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-200"
                                : img.status === "Expiring Soon"
                                  ? "inline-flex items-center rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200"
                                  : "inline-flex items-center rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-200"
                            }
                          >
                            {img.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 align-middle">
                          <div className="max-w-xs">
                            {img.isExtracting ? (
                              <div className="flex items-center gap-2 text-white/70">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                                <span className="text-xs">Extracting...</span>
                              </div>
                            ) : (
                              <div className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs text-white/90 backdrop-blur max-h-24 overflow-y-auto">
                                {img.extractedText || "-"}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td className="py-6 text-white/70" colSpan={5}>No items yet. Upload images to see results.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div className="mx-auto max-w-7xl mt-6 text-center text-xs text-white/80">
        Powered by Randomwalk.ai
      </div>
    </div>
  );
}
