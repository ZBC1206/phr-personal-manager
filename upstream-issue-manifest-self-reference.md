# 拟提交上游的 Issue 草稿：manifest.xml 自身是否应计入文件清单？

**标题**：规范澄清请求：manifest.xml 的清单范围是否应排除其自身？

**正文**：
规范（v1.0）关于文件清单的描述为"记录容器内所有文件条目（除 mimetype 和 signatures.xml 外）
及其完整性校验信息"。按字面理解 manifest.xml 需要包含自身条目，但清单若含自身的
SHA-256 校验值，会形成"写入哈希会改变文件内容、从而改变哈希"的自引用悖论，逻辑上不可实现。

作为第三方实现（phr-personal-manager），我们目前参照 ODF（OpenDocument）惯例，
将 manifest.xml 与 mimetype、signatures.xml 一并排除在清单之外，并已通过 manifest.xsd 校验。

建议规范在下一修订版中明确其一：
1. 清单范围明确排除 manifest.xml 自身（与 ODF 一致，实现最简单）；
2. 或规定 manifest 中自身条目省略 checksum 属性、仅保留 path/size。

若维护者确认口径，我们将同步调整实现并在文档中标注。感谢开放规范。
