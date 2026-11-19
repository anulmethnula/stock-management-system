// Small, dependency-free XLSX reader/writer for StockEasy's PO bulk-entry template.
// Reads only the first worksheet. Never evaluates spreadsheet formulas.
import zlib from "node:zlib";

const escapeXML = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const unescapeXML = value => String(value ?? "").replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (full, numeric, named) => {
  if (numeric) {
    const n = numeric[0].toLowerCase() === "x" ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10);
    return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
  }
  return ({ amp:"&",lt:"<",gt:">",quot:'"',apos:"'" })[named.toLowerCase()] ?? full;
});
const table = Uint32Array.from({length:256}, (_, i) => {
  let c=i;
  for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1;
  return c>>>0;
});
const crc32 = buf => {
  let crc=0xffffffff;
  for(const value of buf) crc=table[(crc^value)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
};
const xmlCell = (cell, value, style=0) =>
  typeof value === "number" && Number.isFinite(value)
    ? '<c r="'+cell+'" s="'+style+'"><v>'+value+'</v></c>'
    : '<c r="'+cell+'" s="'+style+'" t="inlineStr"><is><t>'+escapeXML(value)+'</t></is></c>';

function buildZip(entries) {
  const local=[],central=[];
  let offset=0;
  for(const [name,text] of entries) {
    const file=Buffer.from(name,"utf8"),data=Buffer.from(text,"utf8"),crc=crc32(data);
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);
    header.writeUInt16LE(20,4);
    header.writeUInt16LE(0x0800,6);
    header.writeUInt32LE(crc,14);
    header.writeUInt32LE(data.length,18);
    header.writeUInt32LE(data.length,22);
    header.writeUInt16LE(file.length,26);
    local.push(header,file,data);
    const cd=Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50,0);
    cd.writeUInt16LE(20,4);
    cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(0x0800,8);
    cd.writeUInt32LE(crc,16);
    cd.writeUInt32LE(data.length,20);
    cd.writeUInt32LE(data.length,24);
    cd.writeUInt16LE(file.length,28);
    cd.writeUInt32LE(offset,42);
    central.push(cd,file);
    offset+=header.length+file.length+data.length;
  }
  const centralSize=central.reduce((sum,b)=>sum+b.length,0);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(entries.length,8);
  eocd.writeUInt16LE(entries.length,10);
  eocd.writeUInt32LE(centralSize,12);
  eocd.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,eocd]);
}
// Purchase order template is intentionally different from the 11-column
// inventory count template: quantities here are NEW REQUESTS, not final stock.
export const poHeaders=[
  "Item Code","Item Name","Category","Unit","Order Quantity","Unit Cost (Rs)","Total Cost (Rs)"
];
const PO_COLS="ABCDEFG";
export function buildPOTemplate(products, quantitiesById = {}) {
  if(products.length>1000)throw new Error("Too many items to export. Please split the catalogue.");
  const lastRow=Math.max(501,products.length+1),rows=[
    '<row r="1" ht="36" customHeight="1">'+poHeaders.map((v,i)=>xmlCell(PO_COLS[i]+"1",v,1)).join("")+"</row>"
  ];
  for(let i=0;i<lastRow-1;i++){
    const row=i+2,p=products[i];
    const reference=p?[p.sku||"",p.name,p.category||"",p.unit||"pieces"]:["","","",""];
    const qty=p?(quantitiesById[p.id]??quantitiesById[p.sku]):undefined;
    const inputs=reference.map((v,col)=>xmlCell(PO_COLS[col]+row,v,0)).join("")
      +(qty!==undefined?xmlCell("E"+row,Number(qty),2):'<c r="E'+row+'" s="2"/>')
      +xmlCell("F"+row,p?Number(p.cost)||0:"",3)
      +'<c r="G'+row+'" s="4"><f>IF(OR(E'+row+'="",E'+row+'=0,F'+row+'=""),"",E'+row+'*F'+row+')</f></c>';
    rows.push('<row r="'+row+'" ht="23" customHeight="1">'+inputs+"</row>");
  }
  const widths=[20,40,24,17,19,21,22];
  const columns=widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join("");
  const validations=[
    '<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Invalid PO quantity" error="Enter a whole number from 1 to 100000000, or leave blank." sqref="E2:E'+lastRow+'"><formula1>1</formula1><formula2>100000000</formula2></dataValidation>',
    '<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Invalid buying price" error="Enter a non-negative unit cost." sqref="F2:F'+lastRow+'"><formula1>0</formula1><formula2>1000000000000</formula2></dataValidation>'
  ].join("");
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    +'<sheetFormatPr defaultRowHeight="22"/><cols>'+columns+'</cols><sheetData>'+rows.join("")+'</sheetData>'
    +'<autoFilter ref="A1:G'+lastRow+'"/><dataValidations count="2">'+validations+'</dataValidations></worksheet>';
  const guide=[
    ["STOCKEASY — PURCHASE ORDER BULK REQUEST",""],
    ["1. CHOOSE SUPPLIER","Choose the requested supplier/branch in the StockEasy PO form before uploading."],
    ["2. EXISTING ITEMS","Use the saved Item Code. Name, Category and Unit may be blank or must match Inventory."],
    ["3. NEW ITEMS","Enter a unique Item Code, Item Name, Category and Unit. The sheet has 500 entry rows."],
    ["4. ORDER QUANTITY","Enter a positive whole number in column E."],
    ["5. UNIT COST","Enter a non-negative buying price in column F."],
    ["6. AUTO TOTAL","Column G calculates Order Quantity × Unit Cost. Do not edit the formula."],
    ["7. PREVIEW","Upload Excel; review the selected products, quantities and prices; save PO only after checking."],
    ["8. STOCK UPDATE","Creating a PO does NOT change stock. Stock increases only when staff save a GRN for actual goods received."],
    ["9. SUPPLIER NOTE","New products use the supplier selected in the StockEasy PO form."],
    ["10. LIMIT","Maximum 200 different items per purchase order. Split larger purchase orders."],
    ["IMPORTANT","Saving a PO creates missing products with stock 0. Only a GRN increases stock."]
  ];
  const guideRows=guide.map((r,i)=>'<row r="'+(i+1)+'" ht="27" customHeight="1">'
    +xmlCell("A"+(i+1),r[0],i===0?1:0)+xmlCell("B"+(i+1),r[1],0)+"</row>").join("");
  const guideSheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="125" customWidth="1"/></cols>'
    +'<sheetData>'+guideRows+'</sheetData></worksheet>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'
    +'<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FF176448"/><bgColor indexed="64"/></patternFill></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FFE5F5EC"/><bgColor indexed="64"/></patternFill></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FFE8F1FD"/><bgColor indexed="64"/></patternFill></fill></fills>'
    +'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    +'<border><left style="thin"><color rgb="FFCBDDD3"/></left><right style="thin"><color rgb="FFCBDDD3"/></right>'
    +'<top style="thin"><color rgb="FFCBDDD3"/></top><bottom style="thin"><color rgb="FFCBDDD3"/></bottom></border></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="1"/>'
    +'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    +'<xf numFmtId="1" fontId="0" fillId="3" borderId="1" applyNumberFormat="1" applyFill="1"/>'
    +'<xf numFmtId="2" fontId="0" fillId="0" borderId="1" applyNumberFormat="1"/>'
    +'<xf numFmtId="2" fontId="0" fillId="4" borderId="1" applyNumberFormat="1" applyFill="1"/></cellXfs>'
    +'</styleSheet>';
  const book='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheets><sheet name="Stock Request" sheetId="1" r:id="rId1"/><sheet name="How to Fill" sheetId="2" r:id="rId2"/></sheets>'
    +'<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>';
  return buildZip([
    ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      +'</Types>'],
    ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      +'</Relationships>'],
    ["xl/workbook.xml",book],
    ["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
      +'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      +'</Relationships>'],
    ["xl/worksheets/sheet1.xml",sheet],
    ["xl/worksheets/sheet2.xml",guideSheet],
    ["xl/styles.xml",styles]
  ]);
}
function unzipNeeded(buf) {
  if(!Buffer.isBuffer(buf)||buf.length<100||buf.length>4*1024*1024) throw new Error("Please upload an Excel .xlsx file smaller than 4 MB.");
  let eocd=-1;
  for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){
    if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0) throw new Error("This is not a valid .xlsx file.");
  const count=buf.readUInt16LE(eocd+10),offset=buf.readUInt32LE(eocd+16),length=buf.readUInt32LE(eocd+12);
  if(count>150||count<1||offset+length>eocd) throw new Error("Excel file structure is not supported.");
  const found=new Map();
  let pos=offset;
  for(let i=0;i<count;i++){
    if(pos+46>eocd||buf.readUInt32LE(pos)!==0x02014b50) throw new Error("Damaged Excel file.");
    const flags=buf.readUInt16LE(pos+8),method=buf.readUInt16LE(pos+10);
    const size=buf.readUInt32LE(pos+20),outSize=buf.readUInt32LE(pos+24);
    const nameLen=buf.readUInt16LE(pos+28),extraLen=buf.readUInt16LE(pos+30),commentLen=buf.readUInt16LE(pos+32);
    const localAt=buf.readUInt32LE(pos+42),next=pos+46+nameLen+extraLen+commentLen;
    if(next>eocd)throw new Error("Damaged Excel file.");
    const name=buf.subarray(pos+46,pos+46+nameLen).toString("utf8");
    pos=next;
    if(!["xl/worksheets/sheet1.xml","xl/sharedStrings.xml"].includes(name)) continue;
    if(flags&1||![0,8].includes(method)||outSize>6*1024*1024||size>4*1024*1024)
      throw new Error("Excel file is too large or uses an unsupported format.");
    if(localAt+30>buf.length||buf.readUInt32LE(localAt)!==0x04034b50)throw new Error("Damaged Excel file.");
    const start=localAt+30+buf.readUInt16LE(localAt+26)+buf.readUInt16LE(localAt+28);
    if(start+size>buf.length)throw new Error("Damaged Excel file.");
    const input=buf.subarray(start,start+size);
    const output=method===0?input:zlib.inflateRawSync(input,{maxOutputLength:6*1024*1024});
    if(output.length!==outSize)throw new Error("Damaged Excel file.");
    found.set(name,output.toString("utf8"));
  }
  if(!found.has("xl/worksheets/sheet1.xml"))throw new Error("Please use the downloaded StockEasy template (first worksheet).");
  return found;
}
function xmlText(cell,shared) {
  const t=/\bt="([^"]+)"/.exec(cell.attrs)?.[1];
  if(t==="inlineStr"){
    const texts=[...cell.body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>unescapeXML(m[1]));
    return texts.join("");
  }
  const raw=/<v>([\s\S]*?)<\/v>/.exec(cell.body)?.[1]??"";
  if(t==="s") return shared[Number(raw)]??"";
  return unescapeXML(raw);
}
export function parsePOUpload(buffer,products){
  const files=unzipNeeded(buffer);
  const sharedText=files.get("xl/sharedStrings.xml")||"";
  const shared=[...sharedText.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>
    [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>unescapeXML(t[1])).join(""));
  const rows=[];
  const sheet=files.get("xl/worksheets/sheet1.xml");
  for(const m of sheet.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)){
    if(rows.length>1200)throw new Error("Excel file has too many rows (maximum 1,200).");
    const values={};
    for(const cell of m[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const col=/\br="([A-Z]+)\d+"/.exec(cell[1])?.[1];
      if(col&&PO_COLS.includes(col)&&col.length===1)
        values[col]=xmlText({attrs:cell[1],body:cell[2]||""},shared);
    }
    rows.push({number:Number(m[1]),values});
  }
  const header=rows.find(r=>r.number===1)?.values||{};
  if(poHeaders.some((name,i)=>String(header[PO_COLS[i]]||"").trim()!==name))
    throw new Error("Wrong PO Excel columns. Download a fresh PO template from StockEasy. Do not use the Current Stock Migration template.");
  const selected=[],errors=[],seen=new Set();
  const norm=v=>String(v??"").trim().toLocaleLowerCase("en");
  const bySku=new Map();
  for(const product of products){
    const key=norm(product.sku);
    if(!key)continue;
    if(!bySku.has(key))bySku.set(key,[]);
    bySku.get(key).push(product);
  }
  for(const row of rows.filter(x=>x.number>1)){
    const raw=String(row.values.E??"").trim();
    if(raw===""||raw==="0")continue;
    const qty=Number(raw);
    if(!Number.isSafeInteger(qty)||qty<1||qty>100000000){
      errors.push("Row "+row.number+": Order Quantity must be a positive whole number.");continue;
    }
    const sku=String(row.values.A??"").trim();
    if(!sku){errors.push("Row "+row.number+": Item Code is required.");continue;}
    const key=norm(sku),matches=bySku.get(key)||[];
    if(matches.length>1){errors.push("Row "+row.number+": Item Code '"+sku+"' is duplicated in Inventory.");continue;}
    if(seen.has(key)){errors.push("Row "+row.number+": Item Code '"+sku+"' was entered twice.");continue;}
    seen.add(key);
    const product=matches[0]||null;
    if(product&&!product.active){errors.push("Row "+row.number+": "+product.name+" is archived.");continue;}
    const name=String(row.values.B??"").trim(),category=String(row.values.C??"").trim(),unit=String(row.values.D??"").trim();
    if(product&&((name&&norm(name)!==norm(product.name))||(category&&norm(category)!==norm(product.category))||(unit&&norm(unit)!==norm(product.unit)))){
      errors.push("Row "+row.number+": Item details do not match the saved product for code '"+sku+"'.");continue;
    }
    if(!product&&(!name||!category||!unit)){
      errors.push("Row "+row.number+": New items require Item Name, Category and Unit.");continue;
    }
    const costRaw=String(row.values.F??"").trim();
    const cost=costRaw===""&&product?Number(product.cost):Number(costRaw);
    if(!Number.isFinite(cost)||cost<0||cost>1e12){
      errors.push("Row "+row.number+": Unit Cost must be a non-negative amount.");continue;
    }
    selected.push(product
      ?{pid:product.id,qty,cost:Math.round(cost*100)/100,name:product.name,sku:product.sku||"",category:product.category,unit:product.unit,isNew:false}
      :{sku,name,category,unit,qty,cost:Math.round(cost*100)/100,isNew:true});
    if(selected.length>200){errors.push("A purchase order can contain a maximum of 200 different items.");break;}
  }
  if(errors.length){
    const e=new Error("Fix the PO Excel:\n"+errors.slice(0,8).join("\n")+(errors.length>8?"\n...and "+(errors.length-8)+" more.":""));
    e.status=422;throw e;
  }
  if(!selected.length){const e=new Error("No order quantities entered. Enter numbers in column E (Order Quantity) and upload again.");e.status=422;throw e;}
  return selected;
}

// Current Stock Migration: the same 11-column, bordered template is used for
// first-time opening balances and later absolute stock counts / item updates.
// Only the Current Stock sheet is imported; calculated totals are not trusted.
export const inventoryHeaders = [
  "Product ID","Item Code","Item Name","Category","Supplier / Branch","Unit",
  "Quantity","Unit Cost (Rs)","Selling Price (Rs)","Total Cost (Rs)","Total Selling (Rs)"
];
const excelCol=i=>String.fromCharCode(65+i);
export function buildInventoryTemplate(products=[]) {
  if(products.length>1500) throw new Error("Too many items for one workbook; contact your administrator.");
  const nRows=Math.max(500,products.length)+1;
  const hdr="<row r=\"1\" ht=\"35\" customHeight=\"1\">"+inventoryHeaders.map((h,i)=>xmlCell(excelCol(i)+"1",h,1)).join("")+"</row>";
  const lines=[hdr];
  for(let j=2;j<=nRows;j++){
    const p=products[j-2];
    const values=p?[p.id,p.sku||"",p.name,p.category,p.supplierName,p.unit,p.stock,p.cost,p.sell]:Array(9).fill("");
    let cells=values.map((v,i)=>xmlCell(excelCol(i)+j,v,[0,1,2,3,4,5].includes(i)?0:i===6?2:3)).join("");
    cells+='<c r="J'+j+'" s="4"><f>IF(OR(G'+j+'="",H'+j+'=""),"",G'+j+'*H'+j+')</f></c>';
    cells+='<c r="K'+j+'" s="4"><f>IF(OR(G'+j+'="",I'+j+'=""),"",G'+j+'*I'+j+')</f></c>';
    lines.push('<row r="'+j+'" ht="23" customHeight="1">'+cells+"</row>");
  }
  const cols=[14,19,36,23,31,16,15,19,20,21,22].map((width,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+width+'" customWidth="1"/>').join("");
  const ranges=[
    '<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Invalid quantity" error="Enter a whole number (0 or more)." sqref="G2:G'+nRows+'"><formula1>0</formula1><formula2>100000000</formula2></dataValidation>',
    '<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Invalid price" error="Enter a non-negative price." sqref="H2:I'+nRows+'"><formula1>0</formula1><formula2>1000000000000</formula2></dataValidation>'
  ].join("");
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    +'<sheetFormatPr defaultRowHeight="22"/><cols>'+cols+'</cols><sheetData>'+lines.join("")+'</sheetData>'
    +'<autoFilter ref="A1:K'+nRows+'"/><dataValidations count="2">'+ranges+'</dataValidations></worksheet>';
  const guide=[
    ["STOCKEASY — CURRENT STOCK BULK UPLOAD",""],
    ["STEP 1","Download this template from Items → Bulk Upload."],
    ["STEP 2","Add new items or edit existing items. Keep the 11 columns and their order."],
    ["STEP 3","For existing items, keep Product ID and Item Code. New items MUST have a unique Item Code; leave Product ID blank."],
    ["STEP 4","Type exact Supplier / Branch names already saved in StockEasy. New Categories are created from Excel."],
    ["STEP 5","Quantity is the FINAL PHYSICAL COUNT, NOT an amount to add."],
    ["STEP 6","Total Cost and Total Selling calculate automatically; do not enter these totals."],
    ["STEP 7","Upload → Preview changes, errors and stock differences → Confirm."],
    ["WARNING","If this is a new supplier delivery, use PO → GRN instead of bulk stock count."],
    ["IMPORTANT","Repeat uploads are blocked. Preview each change carefully; the system records a full audit history."],
    ["EXAMPLE","Current stock 100, Excel quantity 120 → final stock 120 (not 220)."]
  ];
  const guideRows=guide.map((r,i)=>'<row r="'+(i+1)+'" ht="27" customHeight="1">'+xmlCell("A"+(i+1),r[0],i===0?1:0)+xmlCell("B"+(i+1),r[1],0)+'</row>');
  const guideSheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="25" customWidth="1"/><col min="2" max="2" width="115" customWidth="1"/></cols><sheetData>'+guideRows.join("")+'</sheetData></worksheet>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'
    +'<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FF176448"/><bgColor indexed="64"/></patternFill></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FFE8F1FD"/><bgColor indexed="64"/></patternFill></fill></fills>'
    +'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    +'<border><left style="thin"><color rgb="FFD1E1D9"/></left><right style="thin"><color rgb="FFD1E1D9"/></right><top style="thin"><color rgb="FFD1E1D9"/></top><bottom style="thin"><color rgb="FFD1E1D9"/></bottom></border></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="1"/>'
    +'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    +'<xf numFmtId="1" fontId="0" fillId="0" borderId="1" applyNumberFormat="1"/>'
    +'<xf numFmtId="2" fontId="0" fillId="0" borderId="1" applyNumberFormat="1"/>'
    +'<xf numFmtId="2" fontId="0" fillId="3" borderId="1" applyNumberFormat="1" applyFill="1"/></cellXfs>'
    +'</styleSheet>';
  const book='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Current Stock" sheetId="1" r:id="rId1"/><sheet name="How to Fill" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>';
  return buildZip([
    ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      +'</Types>'],
    ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      +'</Relationships>'],
    ["xl/workbook.xml",book],
    ["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
      +'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      +'</Relationships>'],
    ["xl/worksheets/sheet1.xml",sheet],
    ["xl/worksheets/sheet2.xml",guideSheet],
    ["xl/styles.xml",styles]
  ]);
}
export function parseInventoryUpload(buffer){
  const files=unzipNeeded(buffer);
  const sharedText=files.get("xl/sharedStrings.xml")||"";
  const shared=[...sharedText.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>
    [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>unescapeXML(t[1])).join(""));
  const rows=[],errors=[];
  for(const m of files.get("xl/worksheets/sheet1.xml").matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)){
    if(rows.length>2000)throw new Error("A bulk import can have a maximum of 2,000 rows.");
    const values={};
    for(const cell of m[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const col=/\br="([A-Z]+)\d+"/.exec(cell[1])?.[1];
      if(col && /^[A-K]$/.test(col))values[col]=xmlText({attrs:cell[1],body:cell[2]||""},shared);
    }
    rows.push({number:Number(m[1]),values});
  }
  const header=rows.find(r=>r.number===1)?.values||{};
  if(inventoryHeaders.some((h,i)=>String(header[excelCol(i)]||"").trim()!==h))
    throw new Error("Wrong Excel columns or order. Download the Current Stock template from StockEasy.");
  const selected=[],ids=new Set(),codes=new Set(),sameNames=new Set();
  const intVal=(value,label,row,optional=false)=>{
    const t=String(value??"").trim();if(optional&&t==="")return null;
    const n=Number(t);if(t===""||!Number.isSafeInteger(n)||n<(optional?1:0)||n>100000000)
      throw new Error("Row "+row+": "+label+" must be a non-negative whole number.");
    return n;
  };
  const priceVal=(value,label,row)=>{
    const t=String(value??"").trim();const n=Number(t);
    if(t===""||!Number.isFinite(n)||n<0||n>1e12||!Number.isFinite(Math.round(n*100)/100))
      throw new Error("Row "+row+": "+label+" must be a non-negative amount.");
    return Math.round(n*100)/100;
  };
  for(const r of rows.filter(x=>x.number>1)){
    const v=r.values;
    if("ABCDEFGHI".split("").every(col=>String(v[col]??"").trim()===""))continue;
    try {
      const id=intVal(v.A,"Product ID",r.number,true);
      const sku=String(v.B??"").trim(),name=String(v.C??"").trim(),category=String(v.D??"").trim();
      const supplier=String(v.E??"").trim(),unit=String(v.F??"").trim();
      if(!name||name.length>255)throw new Error("Row "+r.number+": Enter an Item Name.");
      if(sku.length>60)throw new Error("Row "+r.number+": Item Code is too long.");
      if(!id&&!sku)throw new Error("Row "+r.number+": New items require a unique Item Code.");
      if(!category||category.length>40)throw new Error("Row "+r.number+": Enter a Category.");
      if(!supplier||supplier.length>255)throw new Error("Row "+r.number+": Enter a Supplier / Branch.");
      if(!unit||unit.length>40)throw new Error("Row "+r.number+": Enter a Unit.");
      const qty=intVal(v.G,"Quantity",r.number);
      const cost=priceVal(v.H,"Unit Cost",r.number),sell=priceVal(v.I,"Selling Price",r.number);
      if(id){if(ids.has(id))throw new Error("Row "+r.number+": Duplicate Product ID "+id+".");ids.add(id);}
      if(sku){if(codes.has(sku.toLowerCase()))throw new Error("Row "+r.number+": Duplicate Item Code "+sku+".");codes.add(sku.toLowerCase());}
      const nameKey=name.toLowerCase()+"|"+supplier.toLowerCase();
      if(sameNames.has(nameKey))throw new Error("Row "+r.number+": Duplicate Item Name for this supplier.");
      sameNames.add(nameKey);
      selected.push({row:r.number,id,sku,name,category,supplier,unit,qty,cost,sell});
    }catch(e){errors.push(e.message);}
  }
  if(!selected.length&&!errors.length)errors.push("No item rows found. Fill in the Current Stock sheet first.");
  return {rows:selected,errors};
}


// General-purpose real XLSX exporter. Numeric cells stay numeric, text stays
// inline text (including values beginning with "="), never executable formulae.
const sheetColumn=index=>{
  let out="",n=index+1;
  while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}
  return out;
};
const sheetXmlText=(title,headers,rows,options={})=>{
  const max=Math.max(1,headers.length),last=Math.max(2,rows.length+1);
  const grid=[
    '<row r="1" ht="36" customHeight="1">'+headers.map((name,j)=>xmlCell(sheetColumn(j)+"1",name,1)).join("")+"</row>"
  ];
  rows.forEach((values,i)=>{
    const n=i+2;
    grid.push('<row r="'+n+'" ht="22" customHeight="1">'+headers.map((_,j)=>{
      const value=values[j]??"";
      return xmlCell(sheetColumn(j)+n,value,j===options.editIndex?2:typeof value==="number"?3:0);
    }).join("")+"</row>");
  });
  const widths=headers.map((header,i)=>{
    const length=String(header).length;
    return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.min(45,Math.max(14,length+5))+'" customWidth="1"/>';
  }).join("");
  const validation=Number.isInteger(options.editIndex)
    ?'<dataValidations count="1"><dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Invalid received quantity" error="Enter a positive whole number, or leave the cell empty." sqref="'+sheetColumn(options.editIndex)+'2:'+sheetColumn(options.editIndex)+last+'"><formula1>1</formula1><formula2>100000000</formula2></dataValidation></dataValidations>'
    :"";
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    +'<sheetFormatPr defaultRowHeight="22"/><cols>'+widths+'</cols><sheetData>'+grid.join("")+'</sheetData>'
    +'<autoFilter ref="A1:'+sheetColumn(max-1)+last+'"/>'+validation+'</worksheet>';
};
const sheetXmlStyles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  +'<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'
  +'<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  +'<fill><patternFill patternType="solid"><fgColor rgb="FF176448"/><bgColor indexed="64"/></patternFill></fill>'
  +'<fill><patternFill patternType="solid"><fgColor rgb="FFE5F5EC"/><bgColor indexed="64"/></patternFill></fill></fills>'
  +'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  +'<border><left style="thin"><color rgb="FFD0DFD8"/></left><right style="thin"><color rgb="FFD0DFD8"/></right>'
  +'<top style="thin"><color rgb="FFD0DFD8"/></top><bottom style="thin"><color rgb="FFD0DFD8"/></bottom></border></borders>'
  +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  +'<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1"/>'
  +'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
  +'<xf numFmtId="1" fontId="0" fillId="3" borderId="1" applyFill="1" applyNumberFormat="1"/>'
  +'<xf numFmtId="2" fontId="0" fillId="0" borderId="1" applyNumberFormat="1"/>'
  +'</cellXfs></styleSheet>';
export function buildTableWorkbook({sheetName="Report",headers,rows,guide=[],editIndex=null}){
  if(!Array.isArray(headers)||!headers.length||headers.length>35)throw new Error("Excel columns must be between 1 and 35.");
  if(!Array.isArray(rows)||rows.length>50000)throw new Error("Export is too large. Choose a shorter date range (50,000 rows maximum).");
  const guideHeaders=["Instruction","Details"];
  const guideXML=sheetXmlText("How to Fill",guideHeaders,guide);
  const book='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheets><sheet name="'+escapeXML(sheetName.slice(0,31))+'" sheetId="1" r:id="rId1"/><sheet name="How to Fill" sheetId="2" r:id="rId2"/></sheets></workbook>';
  return buildZip([
    ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      +'</Types>'],
    ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      +'</Relationships>'],
    ["xl/workbook.xml",book],
    ["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
      +'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      +'</Relationships>'],
    ["xl/worksheets/sheet1.xml",sheetXmlText(sheetName,headers,rows,{editIndex})],
    ["xl/worksheets/sheet2.xml",guideXML],
    ["xl/styles.xml",sheetXmlStyles]
  ]);
}

export const grnHeaders=[
  "Product ID","Item Code","Item Name","Category","Unit",
  "PO Ordered","Already Received","Still Expected","Receive Now","PO Reference"
];
export function buildGRNTemplate(po,items,receiveNowById={}){
  if(items.length>200)throw new Error("GRN supports at most 200 different items.");
  return buildTableWorkbook({
    sheetName:"Goods Received",headers:grnHeaders,editIndex:8,
    rows:items.map(l=>[
      l.id,l.sku||"",l.name,l.category,l.unit,l.ordered,l.received,l.ordered-l.received,receiveNowById[l.id]??"",po.code
    ]),
    guide:[
      ["PO",po.code],["Supplier",po.supplierName||""],
      ["1","Do not change Product IDs, Item Codes, names, categories or reference quantities."],
      ["2","Enter actual goods received NOW in column I (Receive Now); leave other rows blank."],
      ["3","Receive Now must be a positive whole number and cannot exceed Still Expected."],
      ["4","Upload to the same PO GRN form. Review values then click Save GRN to update stock."],
      ["5","Uploading alone NEVER changes stock. Partial receipts are allowed."],
      ["6","If any goods were received after downloading this file, download a fresh GRN template."],
      ["7","Never upload the 11-column Items Migration sheet or the 7-column PO Request sheet here."]
    ]
  });
}
export function parseGRNUpload(buffer,po,items){
  const files=unzipNeeded(buffer),sharedText=files.get("xl/sharedStrings.xml")||"";
  const shared=[...sharedText.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>
    [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>unescapeXML(t[1])).join(""));
  const byId=new Map(items.map(x=>[x.id,x])),rows=[],seen=new Set(),errors=[];
  const sheet=files.get("xl/worksheets/sheet1.xml");
  const all=[...sheet.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
  if(all.length>1200)throw Object.assign(new Error("GRN template contains too many rows."),{status:422});
  for(const m of all){
    const v={};
    for(const c of m[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const col=/\br="([A-Z]+)\d+"/.exec(c[1])?.[1];
      if(col&&col.length===1&&"ABCDEFGHIJ".includes(col))
        v[col]=xmlText({attrs:c[1],body:c[2]||""},shared);
    }
    if(Number(m[1])===1){
      if(grnHeaders.some((name,i)=>String(v["ABCDEFGHIJ"[i]]||"").trim()!==name))
        throw Object.assign(new Error("Wrong GRN Excel columns. Download the latest GRN template for this PO."),{status:422});
      continue;
    }
    const raw=String(v.I??"").trim();
    if(raw===""||raw==="0")continue;
    const n=Number(raw),pid=Number(v.A),item=byId.get(pid);
    if(!Number.isSafeInteger(n)||n<=0||n>100000000){errors.push("Row "+m[1]+": Receive Now must be a positive whole number.");continue;}
    if(!item){errors.push("Row "+m[1]+": Product does not belong to this PO.");continue;}
    if(seen.has(pid)){errors.push("Row "+m[1]+": Duplicate item in GRN Excel.");continue;}
    seen.add(pid);
    if(String(v.J||"").trim()!==po.code||
      String(v.B??"").trim()!==String(item.sku||"").trim()||
      String(v.C??"").trim()!==item.name||String(v.D??"").trim()!==item.category||
      String(v.E??"").trim()!==item.unit||
      Number(v.F)!==item.ordered||Number(v.G)!==item.received||
      Number(v.H)!==item.ordered-item.received){
      errors.push("Row "+m[1]+": This PO or item has changed. Download a fresh GRN template.");continue;
    }
    if(n>item.ordered-item.received){errors.push("Row "+m[1]+": Only "+(item.ordered-item.received)+" units remain for "+item.name+".");continue;}
    rows.push({pid,qty:n});
  }
  if(!all.length||!all.some(m=>Number(m[1])===1))errors.push("GRN header row is missing.");
  if(!rows.length&&!errors.length)errors.push("Enter received quantities in column I (Receive Now) first.");
  if(errors.length)throw Object.assign(new Error("Fix the GRN Excel:\n"+errors.slice(0,10).join("\n")),{status:422});
  return rows;
}
