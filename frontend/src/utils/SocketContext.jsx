import React, { createContext, useContext, useEffect, useState } from "react";
import { connectSocket, getSocket, disconnectSocket } from "./WebSocketProvider";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = connectSocket();
    setSocket(newSocket);

    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext);
};
