// Server-side validation manifest for the verified puzzle bank.
import {PROOFS_01,HARD_01,OTHER_01} from "./puzzle-bank-01.ts";
import {PROOFS_02,HARD_02,OTHER_02} from "./puzzle-bank-02.ts";
import {PROOFS_03,HARD_03,OTHER_03} from "./puzzle-bank-03.ts";
import {PROOFS_04,HARD_04,OTHER_04} from "./puzzle-bank-04.ts";
import {PROOFS_05,HARD_05,OTHER_05} from "./puzzle-bank-05.ts";
import {PROOFS_06,HARD_06,OTHER_06} from "./puzzle-bank-06.ts";
import {PROOFS_07,HARD_07,OTHER_07} from "./puzzle-bank-07.ts";
import {PROOFS_08,HARD_08,OTHER_08} from "./puzzle-bank-08.ts";
import {PROOFS_09,HARD_09,OTHER_09} from "./puzzle-bank-09.ts";
import {PROOFS_10,HARD_10,OTHER_10} from "./puzzle-bank-10.ts";
import {PROOFS_11,HARD_11,OTHER_11} from "./puzzle-bank-11.ts";
import {PROOFS_12,HARD_12,OTHER_12} from "./puzzle-bank-12.ts";
export const PUZZLE_BANK_PROOFS:Record<string,{moves:string;rating:number}>={...PROOFS_01,...PROOFS_02,...PROOFS_03,...PROOFS_04,...PROOFS_05,...PROOFS_06,...PROOFS_07,...PROOFS_08,...PROOFS_09,...PROOFS_10,...PROOFS_11,...PROOFS_12};
export const VERY_HARD_IDS=[...HARD_01,...HARD_02,...HARD_03,...HARD_04,...HARD_05,...HARD_06,...HARD_07,...HARD_08,...HARD_09,...HARD_10,...HARD_11,...HARD_12];
export const OTHER_IDS=[...OTHER_01,...OTHER_02,...OTHER_03,...OTHER_04,...OTHER_05,...OTHER_06,...OTHER_07,...OTHER_08,...OTHER_09,...OTHER_10,...OTHER_11,...OTHER_12];
