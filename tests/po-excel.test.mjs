import test from "node:test";
import assert from "node:assert/strict";
import { buildPOTemplate, parsePOUpload, buildInventoryTemplate, parseInventoryUpload, inventoryHeaders, poHeaders, buildGRNTemplate, parseGRNUpload, buildTableWorkbook } from "../server/po-excel.js";

const items=[
  {id:11,sku:"HEL-001",name:"Helmet shell",category:"Safety Equipment",supplierName:"Supun Main",unit:"pieces",stock:80,cost:230.50,active:1},
  {id:12,sku:"ELE-002",name:"Copper wire 2.5mm",category:"Electrical",supplierName:"Supun Electrical",unit:"rolls",stock:30,cost:1250,active:1},
  {id:13,sku:"BOX-013",name:"Simple boxes",category:"Packaging",supplierName:"Supun Main",unit:"boxes",stock:0,cost:0,active:1}
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
  assert.throws(()=>parsePOUpload(buildPOTemplate(items),items),/No order quantities entered/);
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

test("Accepts new Item Codes and rejects archived products",()=>{
  const fresh={sku:"NEW-100",name:"New Excel item",category:"New category",unit:"sets",cost:25};
  const imported=parsePOUpload(buildPOTemplate([fresh],{"NEW-100":4}),items);
  assert.deepEqual(imported[0],{...fresh,qty:4,isNew:true});
  assert.throws(()=>parsePOUpload(buildPOTemplate([{...items[0],active:0}],{11:1}),[{...items[0],active:0}]),/archived/);
});

test("Rejects unrelated or very large uploads safely",()=>{
  assert.throws(()=>parsePOUpload(Buffer.from("Not an Excel file"),items),/xlsx/i);
  assert.throws(()=>parsePOUpload(Buffer.alloc(4*1024*1024+1),items),/smaller than 4 MB/);
});


test("Current Stock Excel retains the 11 requested columns, 500 rows, and formulas",()=>{
  const workbook=buildInventoryTemplate([{
    id:13,sku:"BOX-13",name:"CAMY Box",category:"Packaging",supplierName:"Supun Central",
    unit:"pieces",stock:25,cost:75,sell:150
  }]);
  assert.equal(workbook.readUInt32LE(0),0x04034b50);
  const parsed=parseInventoryUpload(workbook);
  assert.deepEqual(parsed.errors,[]);
  assert.deepEqual(parsed.rows,[{
    row:2,id:13,sku:"BOX-13",name:"CAMY Box",category:"Packaging",
    supplier:"Supun Central",unit:"pieces",qty:25,cost:75,sell:150
  }]);
  assert.deepEqual(inventoryHeaders,[
    "Product ID","Item Code","Item Name","Category","Supplier / Branch","Unit",
    "Quantity","Unit Cost (Rs)","Selling Price (Rs)","Total Cost (Rs)","Total Selling (Rs)"
  ]);
});

test("Current Stock parser accepts a new product without ID and rejects invalid stock",()=>{
  const item={id:"",sku:"NEW-01",name:"New product",category:"New category",
    supplierName:"Supun Central",unit:"sets",stock:0,cost:10,sell:20};
  const parsed=parseInventoryUpload(buildInventoryTemplate([item]));
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.rows[0].id,null);
  assert.equal(parsed.rows[0].qty,0);
  const bad=parseInventoryUpload(buildInventoryTemplate([{...item,stock:-1}]));
  assert.match(bad.errors.join(" "),/Quantity must be/);
  const noSku=parseInventoryUpload(buildInventoryTemplate([{...item,sku:""}]));
  assert.match(noSku.errors.join(" "),/unique Item Code/);
  const repeated=parseInventoryUpload(buildInventoryTemplate([item,{...item,name:"Duplicate"}]));
  assert.match(repeated.errors.join(" "),/Duplicate Item Code/);
});


test("PO template supports existing and new products with bordered formulas",()=>{
  assert.deepEqual(poHeaders,[
    "Item Code","Item Name","Category","Unit","Order Quantity","Unit Cost (Rs)","Total Cost (Rs)"
  ]);
  assert.equal(inventoryHeaders.length,11); // inventory count sheet stays separate
  const source=buildPOTemplate(items,{11:4});
  const xml=source.toString("utf8");
  assert.match(xml,/Safety Equipment/);
  assert.match(xml,/Order Quantity/);
  assert.match(xml,/E2/);
  assert.match(xml,/E2\*F2/);
  assert.match(xml,/dataValidations count="2"/);
  assert.match(xml,/left style="thin"/);
  assert.match(xml,/How to Fill/);
  const imported=parsePOUpload(source,items);
  assert.deepEqual(imported.map(x=>({pid:x.pid,qty:x.qty,cost:x.cost})),[{pid:11,qty:4,cost:230.5}]);
  assert.equal(buildPOTemplate([]).readUInt32LE(0),0x04034b50);
});

test("PO Excel cannot be confused with the 11-column Current Stock import",()=>{
  assert.throws(()=>parsePOUpload(buildInventoryTemplate([{
    id:11,sku:"HEL-001",name:"Helmet shell",category:"Safety Equipment",
    supplierName:"Supun Main",unit:"pieces",stock:80,cost:230.5,sell:500
  }]),items),/Wrong PO Excel columns/);
});

test("PO import rejects changed catalog details, while stock reference is informational",()=>{
  const modified=buildPOTemplate([{...items[0],category:"Old Category"}],{11:10});
  assert.throws(()=>parsePOUpload(modified,items),/Item details/);
  const valid=buildPOTemplate([{...items[0],stock:999,supplierName:"Different supplier"}],{11:2});
  assert.equal(parsePOUpload(valid,items)[0].qty,2);
});


test("GRN workbook is PO-specific, imported quantities are validated and stock is untouched",()=>{
  const po={code:"PO-0008",supplierName:"Supun Central"};
  const lines=[{id:11,sku:"HEL-001",name:"Helmet shell",category:"Safety Equipment",unit:"pieces",ordered:25,received:10},
    {id:12,sku:"ELE-002",name:"Copper wire 2.5mm",category:"Electrical",unit:"rolls",ordered:15,received:0}];
  const file=buildGRNTemplate(po,lines,{11:8,12:3});
  assert.equal(file.readUInt32LE(0),0x04034b50);
  assert.ok(file.includes(Buffer.from("Receive Now")));
  assert.ok(file.includes(Buffer.from("How to Fill")));
  assert.deepEqual(parseGRNUpload(file,po,lines),[{pid:11,qty:8},{pid:12,qty:3}]);
  assert.throws(()=>parseGRNUpload(file,{code:"PO-OTHER"},lines),/changed/);
  assert.throws(()=>parseGRNUpload(file,po,[{...lines[0],received:11},lines[1]]),/changed/);
  assert.throws(()=>parseGRNUpload(buildGRNTemplate(po,lines,{11:16}),po,lines),/Only 15 units remain/);
  assert.throws(()=>parseGRNUpload(buildPOTemplate(items,{11:8}),po,lines),/Wrong GRN Excel columns/);
  assert.throws(()=>parseGRNUpload(buildGRNTemplate(po,lines),po,lines),/Enter received quantities/);
});

test("Real Excel workbook stores numeric cells, borders and escaped text safely",()=>{
  const file=buildTableWorkbook({
    sheetName:"Stock Report",headers:["Product","Qty","Cost"],
    rows:[["=HYPERLINK(\"https://bad\", \"bad\")",25,19.5],["CAMY AC",0,100]],
    guide:[["From","2026-11-01"],["To","2026-11-18"]]
  });
  assert.equal(file.readUInt32LE(0),0x04034b50);
  assert.ok(file.includes(Buffer.from("HYPERLINK")));
  assert.ok(file.includes(Buffer.from('t="inlineStr"')));
  assert.ok(file.includes(Buffer.from('r="B2"')));
  assert.ok(file.includes(Buffer.from("left style=")));
  assert.ok(file.includes(Buffer.from("How to Fill")));
  assert.throws(()=>buildTableWorkbook({headers:["A"],rows:Array.from({length:50001},()=>[1])}),/too large/);
});
