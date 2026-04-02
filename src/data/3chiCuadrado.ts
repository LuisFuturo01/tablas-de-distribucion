import type { DistTable } from '../types';

export const chiSquareTable: DistTable = {
  name: "Tabla Chi-cuadrado",
  description: "Valores críticos de χ² según grados de libertad.",
  images: ["../../../../img/chi-left.png", "../../../../img/chi-right.png"],
  zMin: 0,
  zMax: 0,

  rowData: {
    "1": ["2.706","3.841","5.024","6.635"],
    "2": ["4.605","5.991","7.378","9.210"],
    "5": ["9.236","11.070","12.833","15.086"],
    "10": ["15.987","18.307","20.483","23.209"],
    "20": ["28.412","31.410","34.170","37.566"],
    "30": ["40.256","43.773","46.979","50.892"]
  },

  meta: {
    type: "chi",
    columns: [0.10, 0.05, 0.025, 0.01]
  }
};