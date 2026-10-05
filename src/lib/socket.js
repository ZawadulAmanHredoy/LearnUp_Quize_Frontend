import { io } from 'socket.io-client';
import { SOCKET_URL } from './config';

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
  timeout: 10000,
});

export default socket;
