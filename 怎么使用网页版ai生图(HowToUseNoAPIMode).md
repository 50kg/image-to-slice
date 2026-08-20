# 这个项目怎么用？

## 1. figma需要导入插件

在 Figma Desktop 中这样打开：

1. 打开 Figma Desktop，并进入任意一个设计文件。
2. 打开菜单：`Plugins → Development → Import plugin from manifest…`
3. 选择项目里的 [manifest.json](/D:/image-to-slice-1.1.2/manifest.json)。
4. 导入完成后，再打开：
   `Plugins → Development → Image To Slice`
5. 插件窗口出现后，点击“手动 JSON 模式”。

如果提示本地服务没有启动，直接点击“不启动服务，进入手动模式”即可，不需要运行 API 服务。

以后再次打开时，无需重新导入，直接从 `Plugins → Development → Image To Slice` 运行。



## 2. 最小测试

正确进入“手动 JSON 模式”后，当前json文本框里是内置示例，但它引用了 `background.png` 和 `person.png`，没有上传这两张图时不能直接生成。

## 先做一次最小测试

把 JSON 文本框内容全部替换为下面这段：

```
{
  "version": "1.0",
  "meta": {
    "name": "手动模式测试",
    "width": 600,
    "height": 400,
    "backgroundColor": "#F4F6FA"
  },
  "background": {
    "type": "color",
    "color": "#F4F6FA"
  },
  "assets": [],
  "elements": [
    {
      "id": "card",
      "type": "rectangle",
      "name": "卡片背景",
      "x": 80,
      "y": 90,
      "width": 440,
      "height": 220,
      "style": {
        "fill": "#FFFFFF",
        "cornerRadius": 24,
        "stroke": "#DDE2EA",
        "strokeWidth": 1
      }
    },
    {
      "id": "title",
      "type": "text",
      "name": "标题",
      "text": "手动模式运行成功",
      "x": 125,
      "y": 150,
      "width": 350,
      "height": 50,
      "style": {
        "fontSize": 28,
        "fontWeight": 700,
        "color": "#20232A",
        "textAlign": "center"
      }
    },
    {
      "id": "description",
      "type": "text",
      "name": "说明",
      "text": "这个画板完全没有调用 AI API",
      "x": 125,
      "y": 215,
      "width": 350,
      "height": 32,
      "style": {
        "fontSize": 16,
        "fontWeight": 400,
        "color": "#6B7280",
        "textAlign": "center"
      }
    }
  ]
}
```

然后：

1. 点击“格式化”。
2. 向下滚动插件左侧面板。
3. 暂时不用上传图片。
4. “插入位置”建议选择“新建页面”。
5. 点击“预校验”。
6. 出现绿色“校验通过”后，点击“生成 Figma 图层”。

画布中应出现一个名为“手动模式测试”的可编辑 Frame，里面有卡片和两段文字。



## 3. 使用网页版 AI 处理自己的 UI 图片

整体流程是：

```
原始 UI 图片
→ 网页版 AI 分析结构和坐标
→ AI 输出 JSON 和素材清单
→ AI 或人工制作背景图、透明素材
→ 插件中上传 JSON 和素材
→ 生成 Figma 图层
```

### 第一步：把原图交给网页版 AI

打开支持图片上传的网页版 AI，例如 ChatGPT、Gemini、Claude 或 Kimi，新建对话并上传你想还原的 UI 图片。

最好先查看原图的真实像素尺寸，例如 `1080 × 1440`。不要使用聊天窗口中缩放后的显示尺寸。

把下面这段提示词发给 AI：

```
请分析我上传的 UI 图片，并为 Image To Slice 的“手动 JSON 模式”生成结构数据。

要求：

1. 坐标系以图片左上角为原点，x 向右、y 向下。
2. meta.width 和 meta.height 必须使用原图真实像素尺寸。
3. elements 按从底层到顶层排列。
4. 支持的元素类型只有：
   - text
   - rectangle
   - image
   - group
   - container
   - frame
5. 每个元素都必须包含：
   - id
   - type
   - name
   - x
   - y
   - width
   - height
6. text 还必须包含 text，并尽量提供：
   - style.fontSize
   - style.fontWeight
   - style.fontFamily
   - style.lineHeight
   - style.letterSpacing
   - style.color
   - style.textAlign
7. rectangle 可提供：
   - style.fill
   - style.cornerRadius
   - style.stroke
   - style.strokeWidth
8. image 必须提供 src，文件名使用简短英文，例如：
   - background.png
   - hero-person.png
   - logo.png
   - card-decoration.png
9. image.fit 只能使用 fill 或 fit。
10. group、container、frame 必须包含 children。children 的 x、y 坐标相对于容器左上角。
11. 普通文字、纯色按钮、卡片和基础图形必须重建为 Text 或 Rectangle，不要切成图片。
12. 人物、商品、插画、复杂装饰、纹理和艺术字可以作为 Image 素材。
13. 不要使用 ellipse、icon、svg、gradient、autoLayout、mask 等未支持类型。
14. 颜色使用 #RRGGBB。
15. 不确定的坐标也必须给出合理估算，不要省略字段。

先输出“需要准备的图片素材清单”，说明每张素材应包含什么。
然后输出一份完整 JSON。
JSON 必须能够被 JSON.parse 解析，不要写注释，不要在 JSON 中使用省略号。
```

### 第二步：保存 AI 输出的 JSON

AI 返回结果后：

1. 只复制 `{` 到最后一个 `}` 之间的 JSON。
2. 不要复制 `json 和 `。
3. 粘贴到插件的“JSON 结构”文本框。
4. 点击“格式化”。

如果 AI 返回了不支持的类型，让它重新生成，不要自己盲目修改大量坐标。

## 4. 制作背景图和素材图

假设 AI 给出的素材清单是：

```
background.png
hero-person.png
logo.png
```

你需要准备完全同名的图片文件，扩展名和大小写也要一致。

### 制作干净背景

把原图继续发给支持图片编辑的网页版 AI，使用：

```
请基于这张原始 UI 图片制作一张干净背景图。

移除所有文字、按钮、卡片、图标、人物、商品和前景装饰，并根据周围画面自然补全被遮挡区域。

要求：
- 保持原图宽高比例和整体构图
- 不添加新文字、新图标或新主体
- 保留背景颜色、纹理、光影和环境
- 输出完整矩形图片
- 不要裁切画布
```

下载后将文件重命名为 JSON 中指定的 `background.png`。

### 制作独立人物或商品素材

继续上传原图，针对每个素材分别请求：

```
请从原图中单独提取人物主体。

要求：
- 只保留完整人物
- 移除背景和周围 UI
- 输出透明背景 PNG
- 保留原始人物的比例、细节和边缘
- 不添加文字或额外装饰
```

下载后重命名为对应名称，例如 `hero-person.png`。

Logo、商品、复杂插画和装饰也按同样方法分别处理。

注意：网页版 AI 生成透明图片有时会产生假透明棋盘格。若实际下载后仍有背景，需要用 Photopea、Photoshop、Remove.bg 等工具再去除背景。

## 5. 回到插件完成导入

在插件左侧继续向下滚动：

1. “背景图”上传 `background.png`。
2. “其他素材”一次选择 `hero-person.png`、`logo.png` 等文件。
3. 检查素材列表中的文件名。
4. “插入位置”建议首次选择“新建页面”。
5. “背景处理”建议首次选择“底层图片节点”，方便在 Figma 图层面板中检查背景。
6. 点击“预校验”。
7. 根据提示补齐缺失文件或字段。
8. 校验通过后点击“生成 Figma 图层”。

如果提示：

```
缺少素材：hero-person.png
```

说明 JSON 中写的是 `hero-person.png`，但你上传的文件可能叫 `hero-person (1).png`。重命名后重新上传即可。