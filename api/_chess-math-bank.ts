import {randomInt} from 'node:crypto';

export type Difficulty='easy'|'medium'|'hard';
export type MathQuestion={id:string;kind:'math'|'logic';difficulty:Difficulty;prompt:string;answer:string};
const pieces=[{name:'Queen',symbol:'Q',value:9},{name:'Bishop',symbol:'B',value:3},{name:'Rook',symbol:'R',value:5},{name:'Knight',symbol:'N',value:3},{name:'Pawn',symbol:'P',value:1}] as const;
export const pieceValues=Object.fromEntries(pieces.map(piece=>[piece.symbol,piece.value]));

function makeBank():MathQuestion[]{
  const math:MathQuestion[]=[];
  for(const piece of pieces)for(let number=1;number<=25;number++){
    const other=pieces[(pieces.indexOf(piece)+2)%pieces.length];
    const key=`${piece.symbol}-${number}`;
    math.push({id:`math-add-${key}`,kind:'math',difficulty:'easy',prompt:`${number} + ${piece.symbol} = ?`,answer:String(number+piece.value)});
    math.push({id:`math-sub-${key}`,kind:'math',difficulty:'easy',prompt:`${number+piece.value} − ${piece.symbol} = ?`,answer:String(number)});
    math.push({id:`math-mul-${key}`,kind:'math',difficulty:'medium',prompt:`${number} × ${piece.symbol} = ?`,answer:String(number*piece.value)});
    math.push({id:`math-mix-${key}`,kind:'math',difficulty:'hard',prompt:`(${number} + ${piece.symbol}) × ${other.symbol} = ?`,answer:String((number+piece.value)*other.value)});
  }
  // 500 additional Chess Math problems: 100 MDAS, 100 five-term,
  // 100 exact division, 50 fractions, 50 variables, and 100 situations.
  for(const piece of pieces)for(let n=1;n<=20;n++){
    const tag=`${piece.symbol}-${n}`;
    math.push({id:`math-mdas-${tag}`,kind:'math',difficulty:n<=7?'easy':'medium',
      prompt:`${n} + ${piece.symbol} × R − B = ?`,
      answer:String(n+piece.value*5-3)});
    math.push({id:`math-five-${tag}`,kind:'math',difficulty:'hard',
      prompt:`(${piece.symbol} + B) × R + ${n} − Q = ?`,
      answer:String((piece.value+3)*5+n-9)});
    const dividend=n*3;
    math.push({id:`math-divide-${tag}`,kind:'math',difficulty:n<=7?'easy':'medium',
      prompt:`${dividend} × ${piece.symbol} ÷ B − P = ?`,
      answer:String(n*piece.value-1)});
    math.push({id:`math-situation-${tag}`,kind:'math',difficulty:n<=7?'medium':'hard',
      prompt:`You capture a ${piece.name} plus ${n} points from pawns. Your opponent captures a Bishop and a Pawn. What is your material lead? Use a negative number if behind.`,
      answer:String(piece.value+n-4)});
  }
  for(const piece of pieces)for(let n=1;n<=10;n++){
    const tag=`${piece.symbol}-${n}`,half=(piece.value+n)/2;
    math.push({id:`math-half-${tag}`,kind:'math',difficulty:'easy',
      prompt:`(${piece.symbol} + ${n}) ÷ 2 = ? Give a decimal when needed.`,
      answer:String(half)});
    math.push({id:`math-variable-${tag}`,kind:'math',difficulty:'medium',
      prompt:`2 × X + ${piece.symbol} = ${2*n+piece.value}. What is X?`,
      answer:String(n)});
  }
  const logic:MathQuestion[]=[];
  for(const takenByA of pieces)for(const takenByB of pieces){
    const key=`${takenByA.symbol}-${takenByB.symbol}`;
    const story=`Player A captures Player B's ${takenByA.name}. Player B captures Player A's ${takenByB.name}.`;
    const difference=takenByA.value-takenByB.value;
    const winner=difference>0?'A':difference<0?'B':'Equal';
    logic.push({id:`logic-winner-${key}`,kind:'logic',difficulty:'easy',prompt:`${story} Who gained the material advantage? Answer A, B, or Equal.`,answer:winner});
    logic.push({id:`logic-margin-${key}`,kind:'logic',difficulty:'easy',prompt:`${story} How many piece points is the material difference?`,answer:String(Math.abs(difference))});
    logic.push({id:`logic-a-${key}`,kind:'logic',difficulty:'easy',prompt:`${story} How many piece points did Player A capture?`,answer:String(takenByA.value)});
    logic.push({id:`logic-b-${key}`,kind:'logic',difficulty:'easy',prompt:`${story} How many piece points did Player B capture?`,answer:String(takenByB.value)});
  }
  // 200 legal two-capture trades × two distinct questions = 400 more.
  let trades=0;
  outer:for(const a1 of pieces)for(const a2 of pieces)for(const b1 of pieces)for(const b2 of pieces){
    if((a1.symbol==='Q'&&a2.symbol==='Q')||(b1.symbol==='Q'&&b2.symbol==='Q'))continue;
    const key=`${a1.symbol}${a2.symbol}-${b1.symbol}${b2.symbol}`;
    const story=`Player A captures Player B's ${a1.name} and ${a2.name}. Player B captures Player A's ${b1.name} and ${b2.name}.`;
    const difference=a1.value+a2.value-b1.value-b2.value;
    logic.push({id:`logic-trade-${key}`,kind:'logic',difficulty:'medium',prompt:`${story} Who has the material advantage? Answer A, B, or Equal.`,answer:difference>0?'A':difference<0?'B':'Equal'});
    logic.push({id:`logic-points-${key}`,kind:'logic',difficulty:'hard',prompt:`${story} By how many piece points does the leading player lead?`,answer:String(Math.abs(difference))});
    if(++trades===200)break outer;
  }
  if(math.length!==1000||logic.length!==500||new Set([...math,...logic].map(item=>item.id)).size!==1500)throw Error('Chess Math question bank is incomplete.');
  return [...math,...logic];
}
export const chessMathBank=makeBank();
export const chessMathById=new Map(chessMathBank.map(question=>[question.id,question]));

function shuffle<T>(items:T[]):T[]{
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=randomInt(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function pickQuestions(difficulty:Difficulty,count:number){
  const math=shuffle(chessMathBank.filter(item=>item.difficulty===difficulty&&item.kind==='math')).slice(0,Math.ceil(count/2));
  const logic=shuffle(chessMathBank.filter(item=>item.difficulty===difficulty&&item.kind==='logic')).slice(0,Math.floor(count/2));
  return shuffle([...math,...logic]);
}
function stableHash(value:string){let hash=2166136261;for(const character of value)hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;return hash;}
export function questionView(question:MathQuestion,sessionId:string,index=0){
  const seed=stableHash(`${sessionId}:${question.id}`),choice=seed%2===0;
  const id=`q${index+1}`;
  if(!choice)return {id,kind:question.kind,prompt:question.prompt,mode:'exact' as const};
  const answer=question.answer;
  let options:string[];
  if(['A','B','Equal'].includes(answer))options=['A','B','Equal'];
  else{
    const value=Number(answer),choices=new Set([value]);
    for(const delta of [1,-1,3,-3,5,9,2,-2]){if(choices.size>=4)break;const candidate=value+delta;if(Number.isFinite(candidate))choices.add(candidate);}
    options=[...choices].map(String);
  }
  const rotated=options.map((_,index)=>options[(index+seed%options.length)%options.length]);
  return {id,kind:question.kind,prompt:question.prompt,mode:'choice' as const,options:rotated};
}
export function scoreAnswers(questionIds:string[],submitted:Array<{id:string;answer:string}>){
  const answers=new Map(submitted.map(row=>[row.id,row.answer.trim().toLowerCase()]));
  let score=0,answered=0;
  for(const id of questionIds){const answer=answers.get(id);if(!answer)continue;answered++;if(answer===chessMathById.get(id)?.answer.toLowerCase())score++;}
  return {score,answered};
}
