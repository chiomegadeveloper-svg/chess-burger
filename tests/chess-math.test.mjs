import test from 'node:test';
import assert from 'node:assert/strict';
import {chessMathBank,pieceValues,pickQuestions,questionView,scoreAnswers} from '../api/_chess-math-bank.ts';

test('Chess Math generates 1,000 distinct arithmetic and 500 distinct trade questions',()=>{
  assert.equal(chessMathBank.length,1500);
  assert.equal(chessMathBank.filter(question=>question.kind==='math').length,1000);
  assert.equal(chessMathBank.filter(question=>question.kind==='logic').length,500);
  assert.equal(new Set(chessMathBank.map(question=>question.id)).size,1500);
  assert.equal(new Set(chessMathBank.map(question=>question.prompt)).size,1500);
  assert.deepEqual(pieceValues,{Q:9,B:3,R:5,N:3,P:1});
  assert.equal(chessMathBank.find(question=>question.id==='math-add-B-3')?.answer,'6');
  assert.equal(chessMathBank.find(question=>question.id==='logic-winner-Q-R')?.answer,'A');
  assert.equal(chessMathBank.find(question=>question.id==='math-mdas-Q-3')?.answer,'45');
  assert.equal(chessMathBank.find(question=>question.id==='math-five-B-2')?.answer,'23');
  assert.equal(chessMathBank.find(question=>question.id==='math-divide-R-4')?.answer,'19');
  assert.equal(chessMathBank.find(question=>question.id==='math-half-Q-2')?.answer,'5.5');
  assert.equal(chessMathBank.find(question=>question.id==='math-variable-N-3')?.answer,'3');
  assert.equal(chessMathBank.find(question=>question.id==='math-situation-P-1')?.answer,'-2');
});

test('every difficulty can assemble 50 questions from both categories without answers leaking',()=>{
  for(const level of ['easy','medium','hard']){
    const picked=pickQuestions(level,50);
    assert.equal(picked.length,50);
    assert.equal(new Set(picked.map(question=>question.id)).size,50);
    assert.equal(picked.filter(question=>question.kind==='math').length,25);
    assert.equal(picked.filter(question=>question.kind==='logic').length,25);
    assert.ok(picked.every(question=>question.difficulty===level));
    for(const [index,question] of picked.entries()){
      const shown=questionView(question,'6efb4c9c-9141-4bbb-b71c-5ae66085e303',index);
      assert.equal('answer' in shown,false);
      assert.equal(shown.id,`q${index+1}`);
      if(shown.mode==='choice')assert.ok(shown.options.includes(question.answer));
    }
  }
});

test('grading only counts selected questions and trims one-word exact responses',()=>{
  const ids=['math-add-B-3','logic-winner-Q-R'];
  assert.deepEqual(scoreAnswers(ids,[{id:ids[0],answer:' 6 '},{id:ids[1],answer:'a'},{id:'math-add-Q-1',answer:'10'}]),{score:2,answered:2});
});
