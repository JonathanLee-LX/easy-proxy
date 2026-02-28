#!/bin/bash
#
# Easy Proxy 配置清理脚本
# 用于清理 localStorage 中的旧配置数据
#

echo "==================================="
echo "Easy Proxy 配置清理工具"
echo "==================================="
echo ""

# 检查配置文件
echo "1. 检查配置文件位置..."
echo ""

if [ -f ~/.ep/settings.json ]; then
    echo "✓ 系统设置: ~/.ep/settings.json"
else
    echo "✗ 系统设置文件不存在"
fi

if [ -f ~/.ep/mocks.json ]; then
    echo "✓ Mock规则: ~/.ep/mocks.json"
else
    echo "✗ Mock规则文件不存在"
fi

if [ -f ~/.ep/.eprc ]; then
    echo "✓ 路由规则: ~/.ep/.eprc"
else
    echo "✗ 路由规则文件不存在（将使用默认配置）"
fi

echo ""
echo "2. 配置文件位置检查完成"
echo ""

# 迁移旧的 .epconfig 目录
if [ -d ~/.ep/.epconfig ]; then
    echo "发现旧的 .epconfig 目录..."
    
    if [ -f ~/.ep/.epconfig/settings.json ]; then
        echo "  迁移 settings.json 到 ~/.ep/"
        mv ~/.ep/.epconfig/settings.json ~/.ep/settings.json
    fi
    
    if [ -z "$(ls -A ~/.ep/.epconfig)" ]; then
        echo "  删除空的 .epconfig 目录"
        rmdir ~/.ep/.epconfig
    fi
fi

echo ""
echo "==================================="
echo "配置文件结构："
echo "==================================="
echo ""
echo "~/.ep/"
echo "├── settings.json       # 系统设置（主题、字体、AI配置）"
echo "├── mocks.json          # Mock 规则"
echo "├── .eprc               # 路由规则（可选）"
echo "└── ca/                 # SSL 证书"
echo ""
echo "==================================="
echo "清理完成！"
echo "==================================="
echo ""
echo "注意："
echo "- localStorage 中的旧数据已保留作为备份"
echo "- 下次启动时会自动从 localStorage 迁移到文件系统"
echo "- 建议备份 ~/.ep/ 目录：tar -czf ep-backup.tar.gz ~/.ep/"
echo ""
