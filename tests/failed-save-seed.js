module.exports = function (d) {
  var box = d.getElementById("pageText") || d.getElementById("build");
  if (box) box.value = "capital of France :: Paris\ncapital of Italy :: Rome";
};
