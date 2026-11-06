import { io } from 'socket.io-client';
import { EVENTS } from 'shared/events';

let socket = null;

export function initSocket() {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function getSocket() {
  if (!socket) {
    return initSocket();
  }
  return socket;
}

export { EVENTS };
