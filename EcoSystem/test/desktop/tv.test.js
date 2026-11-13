// Televizor: SSDP javobi, UPnP tavsifi, faqat lokal manzillar (SSRF himoyasi), TV'ni tanish.
import { test } from "node:test";
import assert from "node:assert/strict";
import tv from "../../desktop/tv.js";

test("isPrivateUrl: faqat lokal tarmoq http manzillari", () => {
  for (const ok of ["http://192.168.1.103:7676/desc.xml", "http://10.0.0.5/", "http://172.20.1.1:8080/x"]) assert.ok(tv.isPrivateUrl(ok), ok);
  for (const bad of ["http://8.8.8.8/", "https://192.168.1.2/", "http://169.254.169.254/latest", "http://localhost/", "http://172.32.0.1/", "ftp://10.0.0.1/", "x"]) {
    assert.equal(tv.isPrivateUrl(bad), false, bad);
  }
});

test("parseSsdp: LOCATION, ST, SERVER", () => {
  const r = tv.parseSsdp("HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.103:7676/rc.xml\r\nST: urn:dial-multiscreen-org:service:dial:1\r\nSERVER: Linux/4.1 UPnP/1.0\r\n\r\n");
  assert.deepEqual(r, { location: "http://192.168.1.103:7676/rc.xml", st: "urn:dial-multiscreen-org:service:dial:1", server: "Linux/4.1 UPnP/1.0" });
});

test("parseDescription: nom, model, xizmatlar (nisbiy controlURL to'liq manzilga)", () => {
  const xml = `<root><device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>ТВ в гостиной &amp; zal</friendlyName><manufacturer>Samsung</manufacturer><modelName>UE55</modelName>
    <serviceList><service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/upnp/control/RC</controlURL></service></serviceList>
    </device></root>`;
  const d = tv.parseDescription(xml, "http://192.168.1.103:9197/dmr");
  assert.equal(d.name, "ТВ в гостиной & zal");
  assert.equal(d.manufacturer, "Samsung");
  assert.equal(d.services["urn:schemas-upnp-org:service:RenderingControl:1"], "http://192.168.1.103:9197/upnp/control/RC");
  assert.ok(tv.looksLikeTv(d));
  assert.equal(tv.looksLikeTv({ name: "Router", model: "AX", deviceType: "InternetGatewayDevice" }), false);
  assert.ok(tv.looksLikeTv({ name: "x", model: "", deviceType: "", appUrl: "http://192.168.1.5/apps/" }));
});
