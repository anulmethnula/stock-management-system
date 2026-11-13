import test from "node:test";
import assert from "node:assert/strict";
import { buildPOTemplate, parsePOUpload } from "../server/po-excel.js";

const items=[
  {id:11,sku:"HEL-001",name:"Helmet shell",unit:"pieces",cost:230.50,active:1},
  {id:12,sku:"ELE-002",name:"Copper wire 2.5mm",unit:"rolls",cost:1250,active:1},
  {id:13,sku:"",name:"Simple boxes",unit:"boxes",cost:0,active:1}
];

test("Excel template is a genuine XLSX ZIP file and preview imports correct items",()=>{
  const template=buildPOTemplate(items,{11:15,12:7});
  assert.equal(template.readUInt32LE(0),0x04034b50);
  const imported=parsePOUpload(template,items);
  assert.deepEqual(imported.map(x=>({pid:x.pid,qty:x.qty,cost:x.cost})),[
    {pid:11,qty:15,cost:230.5},
    {pid:12,qty:7,cost:1250}
  ]);
});

test("Blank Quantity cells are skipped, not ordered accidentally",()=>{
  assert.throws(()=>parsePOUpload(buildPOTemplate(items),items),/No quantities found/);
  const imported=parsePOUpload(buildPOTemplate(items,{13:2}),items);
  assert.deepEqual(imported.map(x=>[x.pid,x.qty,x.cost]),[[13,2,0]]);
});

test("Rejects decimal, negative, and duplicate quantities",()=>{
  for(const qty of [-2,3.5,100000001]){
    assert.throws(()=>parsePOUpload(buildPOTemplate(items,{11:qty}),items),/Quantity must be a positive whole number/);
  }
  const repeated=[items[0],items[0]];
  assert.throws(()=>parsePOUpload(buildPOTemplate(repeated,{11:10}),items),/entered twice/);
});

test("Rejects missing/inactive product IDs and changed item codes",()=>{
  const old=[{...items[0],sku:"OLD-SKU"}];
  assert.throws(()=>parsePOUpload(buildPOTemplate(old,{11:1}),items),/Item code does not match/);
  assert.throws(()=>parsePOUpload(buildPOTemplate([{...items[0],id:100}],{100:1}),items),/Item not found/);
  assert.throws(()=>parsePOUpload(buildPOTemplate([{...items[0],active:0}],{11:1}),[{...items[0],active:0}]),/Item not found/);
});

test("Rejects unrelated or very large uploads safely",()=>{
  assert.throws(()=>parsePOUpload(Buffer.from("Not an Excel file"),items),/xlsx/i);
  assert.throws(()=>parsePOUpload(Buffer.alloc(4*1024*1024+1),items),/smaller than 4 MB/);
});
