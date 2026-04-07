// types.ts
export interface DistTable {
  name: string;
  description: string;
  images: [string, string]; // Top 2 images
  rowData: Record<string, string[]>;
  zMin: number;
  zMax: number;
  
  meta?: {
    type: "normal" | "t" | "chi" | "f" | "gamma";
    columns?: number[];
    extraDims?: any;
  };
}
