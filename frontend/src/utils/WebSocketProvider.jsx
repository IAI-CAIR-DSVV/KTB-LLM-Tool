import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../api/api";

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(api, {
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });

      socketRef.current.on("connect", () => {
        console.log("WebSocket Connected ✅");
        setIsConnected(true);
      });

      socketRef.current.on("disconnect", () => {
        console.log("WebSocket Disconnected ❌");
        setIsConnected(false);
      });

      socketRef.current.on("connect_error", (error) => {
        console.error("WebSocket Connection Error:", error);
      });
    }

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
