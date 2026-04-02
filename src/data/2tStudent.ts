import type { DistTable } from '../types';

export const tStudentTable: DistTable = {
  name: "Tabla t de Student",
  description: "Valores críticos de t según grados de libertad.",
  images: ["../../../../img/t-left.png", "../../../../img/t-right.png"],
  zMin: 0,
  zMax: 0,

  rowData: {
    "1": ["3.078","6.314","12.706","31.821"],
    "2": ["1.886","2.920","4.303","6.965"],
    "5": ["1.476","2.015","2.571","4.032"],
    "10": ["1.372","1.812","2.228","3.169"],
    "20": ["1.325","1.725","2.086","2.845"],
    "30": ["1.310","1.697","2.042","2.750"]
  },

  meta: {
    type: "t",
    columns: [0.10, 0.05, 0.025, 0.01] // α (cola derecha o bilateral según uso)
  }
};