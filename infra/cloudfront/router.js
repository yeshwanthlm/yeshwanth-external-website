// CloudFront Function (cloudfront-js-2.0), viewer request.
// 1. www.yeshwanthlm.in → yeshwanthlm.in   2. old site URLs → new sections   3. /dir → /dir/ → /dir/index.html
var OLD = [
  ["/invite/thanks", "/thanks/"],
  ["/invite", "/#invite"],
  ["/contact", "/#invite"],
  ["/ping", "/#invite"],
  ["/about", "/#about"],
  ["/blogs", "/#videos"],
  ["/publicspeaking", "/#talks"],
  ["/ieee", "/#ieee"],
  ["/achievements", "/#awards"],
];

function qs(request) {
  var q = request.querystring, keys = Object.keys(q);
  if (!keys.length) return "";
  return "?" + keys.map(function (k) {
    var v = q[k];
    return v.multiValue ? v.multiValue.map(function (m) { return k + "=" + m.value; }).join("&") : k + "=" + v.value;
  }).join("&");
}

function redirect(location) {
  return { statusCode: 301, statusDescription: "Moved Permanently", headers: { location: { value: location }, "cache-control": { value: "max-age=3600" } } };
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : "";
  var uri = request.uri;

  if (host.indexOf("www.") === 0) return redirect("https://" + host.slice(4) + uri + qs(request));

  for (var i = 0; i < OLD.length; i++) {
    var from = OLD[i][0];
    if (uri === from || uri.indexOf(from + "/") === 0) return redirect(OLD[i][1]);
  }

  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else if (uri.lastIndexOf(".") < uri.lastIndexOf("/")) {
    return redirect(uri + "/" + qs(request)); // /admin → /admin/
  }
  return request;
}
