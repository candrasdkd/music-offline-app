export type Track = {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: number;
  categoryIds: string[];
  storage: 'handle' | 'blob';
  handle?: any;
};

export type Category = {
  id: string;
  name: string;
  createdAt: number;
};
