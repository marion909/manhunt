import AsyncStorage from '@react-native-async-storage/async-storage';
import { PositionUpdate } from '../types';
import { Socket } from 'socket.io-client';

const QUEUE_STORAGE_KEY = '@manhunt:position_queue';
const MAX_QUEUE_SIZE = 100;

class QueueService {
  private queue: PositionUpdate[] = [];

  async loadQueue(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`Loaded ${this.queue.length} positions from queue`);
      }
    } catch (error) {
      console.error('Failed to load queue:', error);
      this.queue = [];
    }
  }

  async addToQueue(position: PositionUpdate): Promise<void> {
    this.queue.push(position);

    // Limit queue size
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    await this.saveQueue();
  }

  async flushQueue(socket: Socket | null): Promise<void> {
    if (!socket || !socket.connected || this.queue.length === 0) {
      return;
    }

    console.log(`Flushing ${this.queue.length} positions from queue`);

    // Send all queued positions
    for (const position of this.queue) {
      socket.emit('position:update', position);
    }

    // Clear queue
    this.queue = [];
    await this.saveQueue();
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save queue:', error);
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }
}

export const queueService = new QueueService();
