import React, { useState, useCallback, useEffect, useRef } from "react";
import axios from "axios";
import { api } from "../api/api";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import spinnerImage from "../assets/image.png";
import { motion } from "framer-motion";

const Dashboard = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState("");
  const navigate = useNavigate();
  const [progress, setProgress] = useState("");
  const socketRef = useRef(null);
  const [uploadingStarted, setUploadingStarted] = useState(false);
  const [processedChunks, setProcessedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(1);
  const queryClient = useQueryClient();
  const [uploadStatus, setUploadStatus] = useState("");
  const [isProcessingComplete, setIsProcessingComplete] = useState(false);

  useEffect(() => {
    // Restore progress from local storage
    const savedBookId = localStorage.getItem("book_id");
    const savedProgress = localStorage.getItem("progress");
    const savedProcessedChunks = localStorage.getItem("processedChunks");
    const savedTotalChunks = localStorage.getItem("totalChunks");
    const savedUploadingStarted = localStorage.getItem("uploadingStarted");

    if (savedProgress) setProgress(savedProgress);

    if (savedProcessedChunks && savedTotalChunks) {
      setProcessedChunks(parseInt(savedProcessedChunks, 10));
      setTotalChunks(parseInt(savedTotalChunks, 10));
    }

    if (savedUploadingStarted === "true") {
      setUploadingStarted(true);
    }
    if (savedBookId && socketRef.current) {
      console.log("Restoring processing for book_id:", savedBookId);
      setTimeout(() => {
        socketRef.current.emit("start_process", { book_id: savedBookId });
      }, 1000);  // Ensure WebSocket is fully connected before emitting
    }
  }, []);

  // WebSocket setup
  useEffect(() => {
    if (!socketRef.current) {
      setProgress("Connecting to Server...");
      socketRef.current = io(api, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });

      socketRef.current.on("connect", () => {
        setProgress("Connected to Server ✅");
        setToastMessage("Connected to the server ✅");
        setToastType("success");

        const savedBookId = localStorage.getItem("book_id");
        if (savedBookId) {
          console.log("Resuming process for book_id:", savedBookId);
          socketRef.current.emit("start_process", { book_id: savedBookId });
        }
      });
      socketRef.current.on("reconnect", (attempt) => {
        console.log(`Reconnected after ${attempt} attempts`);
        setProgress("Reconnected to server ✅");
      
        // Try resuming processing
        const savedBookId = localStorage.getItem("book_id");
        if (savedBookId) {
          console.log("Resuming process for book_id:", savedBookId);
          socketRef.current.emit("start_process", { book_id: savedBookId });
        }
      });
      socketRef.current.on("connect_error", () => {
        setProgress("Server connection failed. Retrying... 🔄");
        setToastMessage("Server connection failed. Retrying...");
        setToastType("error");
      });

      socketRef.current.on("progress_update", (data) => {
        if (data.message) {
          setProgress(data.message);
          localStorage.setItem("progress", data.message);

          const match = data.message.match(/Processing chunk (\d+)\/(\d+)/);
          if (match) {
            const processed = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            setProcessedChunks(processed);
            setTotalChunks(total);

            localStorage.setItem("processedChunks", processed);
            localStorage.setItem("totalChunks", total);
          }
        }
      });

      socketRef.current.on("upload_status", (data) => {
        if (data.message) {
          setUploadStatus(data.message);
          setToastType("info");
        }
      });

      socketRef.current.on("completed", () => {
        setProgress("Processing completed! 🎉");
        setToastMessage("Processing completed! 🎉");
        setToastType("success");
        setIsProcessingComplete(true);
        localStorage.setItem("progress", "Processing completed! 🎉");

        // Reset upload state after completion
        setUploadingStarted(false);
        localStorage.removeItem("uploadingStarted");
      });

      socketRef.current.on("error", (error) => {
        const errorMessage = error?.message || "Unknown error occurred";
        setProgress(`Error occurred: ${errorMessage}`);
        setToastMessage(`Error: ${errorMessage}`);
        setToastType("error");
        setUploadingStarted(false);
        localStorage.setItem("progress", `Error: ${errorMessage}`);
        localStorage.removeItem("uploadingStarted");
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);


  useEffect(() => {
    if (processedChunks > 0 && processedChunks === totalChunks && uploadingStarted) {
      setTimeout(() => {
        navigate("/excelViewer");
      }, 1000);

    }
  }, [processedChunks, totalChunks, uploadingStarted, navigate]);

  const isPDF = (file) => {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const uploadedFile = e.dataTransfer.files[0];
    if (uploadedFile && isPDF(uploadedFile)) {
      setFile(uploadedFile);
    } else {
      setToastMessage("Please upload a valid PDF file.");
      setToastType("error");
    }
  }, []);

  const handleFileInput = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile && isPDF(uploadedFile)) {
      setFile(uploadedFile);
    } else {
      setToastMessage("Please upload a valid PDF file.");
      setToastType("error");
    }
  };

  const handleUpload = useMutation({
    mutationFn: async (file) => {
      if (!file) {
        throw new Error("Please select a file before uploading.");
      }
      setUploading(true);
      setUploadingStarted(true);

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Authentication error. Please login again.");
      }

      const formData = new FormData();
      formData.append("pdf", file);
      return axios.post(`${api}/api/upload-pdf`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        withCredentials: true,
      });
    },
    onSuccess: (data) => {
      const bookId = data?.data?.book_id; // Extract book_id from API response

      if (bookId) {
        localStorage.setItem("book_id", bookId); // ✅ Store book_id
      }

      if (socketRef.current && bookId) {
        console.log("Resuming process for book_id:", bookId);
        socketRef.current.emit("start_process", { book_id: bookId }); // ✅ Resume backend process
      } else {
        console.error("WebSocket not connected ❌");
      }

      setToastMessage("Upload successful!");
      setToastType("success");
      setFile(null);
      queryClient.invalidateQueries(["uploadedFiles"]);
      setUploading(false);
      localStorage.setItem("uploadingStarted", "true"); // ✅ Track upload state
    },

    onError: (error) => {
      setToastMessage(error.message || "Error uploading file.");
      setToastType("error");
      setUploading(false);
      setUploadingStarted(false);
      localStorage.removeItem("uploadingStarted"); // ❌ Clear upload state on failure
    },

  });

  return (
    <div className="flex flex-col h-screen">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 w-max">
          <div
            className={`bg-white shadow-md border-t-4 ${toastType === "success" ? "border-green-500" : toastType === "error" ? "border-red-500" : "border-blue-500"
              } text-gray-800 flex items-center max-w-sm p-4 rounded-md`}
            role="alert"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-5 h-5 mr-3 ${toastType === "success" ? "fill-green-500" : toastType === "error" ? "fill-red-500" : "fill-blue-500"
                }`}
              viewBox="0 0 20 20"
            >
              {toastType === "success" ? (
                <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm-1 15l-5-5 1.41-1.41L9 11.17l5.59-5.58L16 7l-7 8z" />
              ) : (
                <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9V9h2v6zm0-8H9V5h2v2z" />
              )}
            </svg>
            <span className="text-sm font-semibold">{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="flex flex-1 justify-center items-center">
        <div className={`flex flex-col items-center p-6 ${uploadingStarted ? "pointer-events-none" : ""}`}>
          {uploadingStarted || processedChunks > 0 ? (
            <div
              className="flex flex-col items-center justify-center border-2 border-blue-800 border-dashed rounded-lg bg-gray-200 bg-opacity-80 p-4"
              style={{ width: "800px", height: "400px" }}
            >
              <div className="relative flex justify-center items-center mb-4">
                <div className="animate-spin rounded-full bg-gray-100 h-30 w-30 border-t-4 border-b-4 border-blue-500"></div>
                <img src={spinnerImage} className="absolute rounded-full h-20 w-20" />
              </div>
              {processedChunks > 0 && (
                <>
                  <div className="w-3/4 bg-gray-400 rounded-lg overflow-hidden mt-6 mb-2">
                    <div
                      className="bg-blue-300 text-m leading-none py-2 text-center text-black rounded-lg transition-all duration-500"
                      style={{ width: `${totalChunks > 1 ? (processedChunks / totalChunks) * 100 : 0}%` }}
                    >
                      {totalChunks > 1 ? `${Math.round((processedChunks / totalChunks) * 100)}%` : "Processing..."}
                    </div>
                  </div>
                  <motion.p
                    key={processedChunks}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="px-4 py-2 text-lg font-bold text-black bg-blue-300 border-t-4 border-r-4 border-blue-500 rounded-lg shadow-md"
                  >
                    Processing Chunks: {processedChunks}/{totalChunks}
                  </motion.p>
                </>
              )}
              {uploadStatus && <p className="mt-2 text-gray-800">Upload Status: {uploadStatus}</p>}

            </div>
          ) : (
            <label
              htmlFor="dropzone-file"
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-blue-800 border-dashed rounded-lg cursor-pointer bg-gray-200 hover:bg-gray-100"
              style={{ width: "800px", height: "400px" }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg
                  className="w-8 h-8 mb-4 text-blue-500"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 20 16"
                >
                  <path
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                  />
                </svg>
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-1000">Only PDF files are allowed</p>
                {file && <p className="text-xs text-gray-700 mt-2">Selected: {file.name}</p>}
              </div>
              <input
                id="dropzone-file"
                type="file"
                className="hidden"
                accept="application/pdf"
                onChange={handleFileInput}
                disabled={uploadingStarted}
              />
            </label>
          )}
          {file && !uploadingStarted && (
            <button
              onClick={() => handleUpload.mutate(file)}
              disabled={uploading}
              className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
export default Dashboard;