import type { DistTable } from '../types';

export const fTable: DistTable = {
  name: "Tabla F de Fisher",
  description: "Valores críticos de F según grados de libertad.",
  images: ["../../../../img/f-left.png", "../../../../img/f-right.png"],
  zMin: 0,
  zMax: 0,

  rowData: {
    "1": ["161.4","199.5","215.7"],
    "2": ["18.51","19.00","19.16"],
    "5": ["6.61","5.79","5.05"],
    "10": ["4.96","4.10","3.71"]
  },

  meta: {
    type: "f",
    columns: [1, 2, 5], // gl2
    extraDims: {
      gl1: [1, 2, 5, 10],
      alpha: 0.05
    }
  }
};