#!/bin/bash

set -u

cd "$(dirname "$0")" || exit 1

clear
echo "Image To Slice - 一键部署环境"
echo "-----------------------------------"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。"
  echo "本插件需要先安装 Node.js 20 或更高版本。"
  echo "下载地址：https://nodejs.org/"
  echo
  echo "我会帮你打开 Node.js 下载页面。"
  echo "安装完成后，请重新打开终端，输入下面两条命令验证："
  echo
  echo "node -v"
  echo "npm -v"
  echo
  echo "如果能看到 v20.x.x、v22.x.x 这类版本号，就说明安装好了。"
  echo "然后重新双击本文件。"
  echo
  open "https://nodejs.org/" >/dev/null 2>&1 || true
  read -r -p "按回车键退出..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "未检测到 npm。"
  echo "npm 通常会随 Node.js 一起安装。"
  echo "请重新安装 Node.js 20 或更高版本，然后重新双击本文件。"
  echo "下载地址：https://nodejs.org/"
  echo
  echo "安装完成后，请重新打开终端，输入下面两条命令验证："
  echo
  echo "node -v"
  echo "npm -v"
  echo
  echo "如果两条命令都能看到版本号，就说明安装好了。"
  echo
  open "https://nodejs.org/" >/dev/null 2>&1 || true
  read -r -p "按回车键退出..."
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "当前 Node.js 版本过低：$(node -v)"
  echo "请升级到 Node.js 20 或更高版本，然后重新双击本文件。"
  echo "下载地址：https://nodejs.org/"
  echo
  echo "升级完成后，请重新打开终端，输入下面两条命令验证："
  echo
  echo "node -v"
  echo "npm -v"
  echo
  echo "如果 node -v 显示 v20.x.x 或更高版本，就说明可以继续。"
  echo
  open "https://nodejs.org/" >/dev/null 2>&1 || true
  read -r -p "按回车键退出..."
  exit 1
fi

echo "Node.js 版本：$(node -v)"
echo "npm 版本：$(npm -v)"
echo
echo "正在安装或检查项目依赖..."
echo

npm install

if [ $? -ne 0 ]; then
  echo
  echo "依赖安装失败。请检查上方红色错误信息。"
  echo "常见原因：网络异常、Node.js 版本过低、项目目录没有写入权限。"
  echo
  read -r -p "按回车键退出..."
  exit 1
fi

echo
echo "依赖已准备好。"
echo "正在启动本地 API 服务..."
echo
echo "看到下面这句就说明启动成功："
echo "OpenAI image proxy listening on http://127.0.0.1:18787"
echo
echo "重要：使用 Figma 插件期间，请不要关闭这个终端窗口。"
echo

npm run api

echo
echo "本地服务已停止。"
read -r -p "按回车键退出..."
