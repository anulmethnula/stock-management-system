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
const headers=["Product ID","Item Code","Item Name","Unit","Quantity","Unit Cost (Rs)"];
export function buildPOTemplate(products, quantitiesById = {}) {
  if(products.length>1000) throw new Error("Too many items to export. Contact the admin.");
  const rowCount=Math.max(2,products.length+1);
  const rows=['<row r="1" ht="27" customHeight="1">'+headers.map((value,i)=>xmlCell("ABCDEF"[i]+"1",value,1)).join("")+'</row>'];
  products.forEach((p,i)=>{
    const n=i+2;
    rows.push('<row r="'+n+'" ht="22" customHeight="1">'
      +xmlCell("A"+n,p.id,0)
      +xmlCell("B"+n,p.sku||"",0)
      +xmlCell("C"+n,p.name,0)
      +xmlCell("D"+n,p.unit||"pieces",0)
      +(quantitiesById[p.id] !== undefined ? xmlCell("E"+n,Number(quantitiesById[p.id]),2) : '<c r="E'+n+'" s="2"/>')
      +xmlCell("F"+n,Number(p.cost)||0,3)
      +'</row>');
  });
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    +'<sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="13" customWidth="1"/>'
    +'<col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="38" customWidth="1"/>'
    +'<col min="4" max="4" width="16" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/>'
    +'<col min="6" max="6" width="21" customWidth="1"/></cols><sheetData>'+rows.join("")+'</sheetData>'
    +'<autoFilter ref="A1:F'+rowCount+'"/></worksheet>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font>'
    +'<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'
    +'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FF24694F"/><bgColor indexed="64"/></patternFill></fill></fills>'
    +'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
    +'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/>'
    +'<xf numFmtId="1" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>'
    +'<xf numFmtId="2" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
  const book='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    +'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheets><sheet name="Stock Request" sheetId="1" r:id="rId1"/></sheets></workbook>';
  return buildZip([
    ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
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
      +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      +'</Relationships>'],
    ["xl/worksheets/sheet1.xml",sheet],
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
      if(col&&"ABCDEF".includes(col)&&col.length===1)
        values[col]=xmlText({attrs:cell[1],body:cell[2]||""},shared);
    }
    rows.push({number:Number(m[1]),values});
  }
  const header=rows.find(r=>r.number===1)?.values||{};
  if(headers.some((name,i)=>String(header["ABCDEF"[i]]||"").trim()!==name))
    throw new Error("Excel columns have changed. Download a fresh template and fill the Quantity column.");
  const selected=[],errors=[],seen=new Set();
  const byId=new Map(products.map(p=>[Number(p.id),p]));
  for(const row of rows.filter(x=>x.number>1)){
    const raw=String(row.values.E??"").trim();
    if(raw===""||raw==="0") continue;
    const qty=Number(raw);
    if(!Number.isSafeInteger(qty)||qty<1||qty>100000000){
      errors.push("Row "+row.number+": Quantity must be a positive whole number.");continue;
    }
    const id=Number(row.values.A);
    const product=byId.get(id);
    if(!product||!product.active){
      errors.push("Row "+row.number+": Item not found or removed (Product ID "+String(row.values.A??"")+").");continue;
    }
    if(seen.has(id)){errors.push("Row "+row.number+": "+product.name+" was entered twice.");continue;}
    seen.add(id);
    const sheetSku=String(row.values.B??"").trim();
    if(sheetSku!==String(product.sku||"").trim()){
      errors.push("Row "+row.number+": Item code does not match "+product.name+". Download a fresh template.");continue;
    }
    const rawCost=String(row.values.F??"").trim();
    const cost=rawCost===""?Number(product.cost):Number(rawCost);
    if(!Number.isFinite(cost)||cost<0||cost>1e12){
      errors.push("Row "+row.number+": Unit cost is not valid.");continue;
    }
    selected.push({pid:id,qty,cost:Math.round(cost*100)/100,name:product.name,sku:product.sku||""});
    if(selected.length>200){errors.push("A purchase order can contain a maximum of 200 different items.");break;}
  }
  if(errors.length) {
    const error=new Error("Please fix the Excel file:\n"+errors.slice(0,8).join("\n")+(errors.length>8?"\n...and "+(errors.length-8)+" more.":""));
    error.status=422;
    throw error;
  }
  if(!selected.length){const error=new Error("No quantities found. Enter numbers in the Quantity column (E) and upload again.");error.status=422;throw error;}
  return selected;
}
