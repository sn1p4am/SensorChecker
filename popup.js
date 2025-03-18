// DOM 元素
const requestCountElement = document.getElementById('request-count');
const requestListElement = document.getElementById('request-list');
const jsonDisplayElement = document.getElementById('json-display');
const selectedEventElement = document.getElementById('selected-event');
const clearButton = document.getElementById('clear-btn');
const searchInput = document.getElementById('search-input');
const copyJsonButton = document.getElementById('copy-json');
const preserveDataToggle = document.getElementById('preserve-data-toggle');

// 存储数据
let allRequests = [];
let filteredRequests = [];
let selectedRequestId = null;
let preserveDataSetting = false;
let isJsonCompressed = false;

// 初始化
function initialize() {
    console.log("popup.js 初始化中...");

    // 全局错误处理，帮助调试
    window.addEventListener('error', function(event) {
        console.error('全局错误:', event.error);
    });

    // 动画效果
    document.body.classList.add('transition');

    // 默认不压缩JSON
    isJsonCompressed = false;

    // 加载设置
    loadSettings();

    // 从后台获取请求数据
    chrome.runtime.sendMessage({ action: 'getRequests' }, (response) => {
        console.log("获取请求数据响应:", response);
        if (response && response.requests) {
            allRequests = response.requests;

            // 调试：检查请求数据中的中文字符
            console.log("检查请求数据中的中文:");
            for (let i = 0; i < Math.min(allRequests.length, 3); i++) {
                const req = allRequests[i];
                if (req.jsonData) {
                    console.log(`请求 #${i+1}, 事件: ${req.event}`);
                    if (typeof req.jsonData === 'object') {
                        // 随机抽取几个可能包含中文的字段进行检查
                        const jsonStr = JSON.stringify(req.jsonData);
                        if (jsonStr.includes('\\u')) {
                            console.log(`  包含Unicode转义序列，可能有中文字符`);
                        }
                    }
                }
            }

            filteredRequests = [...allRequests];
            requestCountElement.textContent = response.requestCount || '0';

            // 动画效果
            if (response.requestCount > 0) {
                requestCountElement.classList.add('shadow');
                animateCount(response.requestCount);
            }

            renderRequestList();

            // 如果有请求，自动选择第一个
            if (filteredRequests.length > 0) {
                selectedRequestId = filteredRequests[0].id;
                displayRequestDetails(filteredRequests[0]);
                const firstItem = document.querySelector('#request-list > div:first-child');
                if (firstItem) {
                    firstItem.classList.add('bg-blue-100');
                }
            }
        } else {
            console.log("未获取到请求数据或数据为空");
            checkDebugInfo();
        }
    });

    // 设置事件监听器
    clearButton.addEventListener('click', clearAllRequests);
    searchInput.addEventListener('input', handleSearch);
    copyJsonButton.addEventListener('click', copyJsonToClipboard);

    // 添加设置保存开关的事件监听
    preserveDataToggle.addEventListener('change', handlePreserveDataToggle);

    // 添加双击JSON区域切换格式功能
    jsonDisplayElement.addEventListener('dblclick', toggleJsonFormat);

    // 修复搜索框聚焦效果
    searchInput.addEventListener('focus', () => {
        searchInput.classList.add('shadow');
    });

    searchInput.addEventListener('blur', () => {
        searchInput.classList.remove('shadow');
    });

    // 添加键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl+F 或 Cmd+F 聚焦到搜索框
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            searchInput.focus();
        }

        // Esc 清除搜索
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            handleSearch();
            searchInput.blur();
        }
    });
}

// 加载用户设置
function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getPreserveData' }, (response) => {
        if (response && response.preserveDataOnNavigation !== undefined) {
            preserveDataSetting = response.preserveDataOnNavigation;
            preserveDataToggle.checked = preserveDataSetting;
            console.log("加载设置：跳转时保留记录 =", preserveDataSetting);
        }
    });
}

// 处理开关切换事件
function handlePreserveDataToggle() {
    preserveDataSetting = preserveDataToggle.checked;

    // 保存设置到后台
    chrome.runtime.sendMessage({
        action: 'setPreserveData',
        value: preserveDataSetting
    }, (response) => {
        console.log("保存设置结果:", response);

        // 添加视觉反馈
        const toggle = preserveDataToggle.parentElement;
        toggle.classList.add('setting-updated');
        setTimeout(() => {
            toggle.classList.remove('setting-updated');
        }, 500);
    });
}

// 请求计数器动画
function animateCount(count) {
    requestCountElement.classList.add('scale-effect');
    setTimeout(() => {
        requestCountElement.classList.remove('scale-effect');
    }, 300);
}

// 获取调试信息
function checkDebugInfo() {
    chrome.runtime.sendMessage({ action: 'getDebugInfo' }, (response) => {
        console.log("调试信息:", response);
        if (!response) {
            jsonDisplayElement.innerHTML = "获取调试信息失败，请检查后台服务是否正常运行。";
            return;
        }

        const debugInfo = {
            "插件状态": "正在运行",
            "已捕获请求数": response.requestCount || 0,
            "最后错误": response.lastError || "无",
            "权限状态": response.hasPermissions ? "已授权" : "未授权",
            "跳转时保留记录": response.preserveDataOnNavigation ? "是" : "否",
            "跟踪的标签页数": response.tabsTracked || 0,
            "刷新检测": response.debugInfo || "状态未知",
            "提示": "如未捕获到请求，请确认页面上确实存在符合条件的请求。可尝试刷新页面或重启浏览器。",
            "使用提示": {
                "搜索功能": "Ctrl+F 激活搜索框",
                "复制功能": "点击右上角复制按钮",
                "JSON格式": "双击JSON内容可切换格式化/压缩视图",
                "JSON高亮": "JSON高亮显示已启用",
                "设置选项": "右上角可设置页面跳转时是否保留记录"
            }
        };

        // 应用JSON语法高亮
        try {
            jsonDisplayElement.innerHTML = formatJsonWithHighlight(debugInfo);
        } catch (error) {
            console.error("格式化调试信息时出错:", error);
            jsonDisplayElement.textContent = JSON.stringify(debugInfo, null, 2);
        }
    });
}

// 渲染请求列表
function renderRequestList() {
    requestListElement.innerHTML = '';

    if (filteredRequests.length === 0) {
        requestListElement.innerHTML = '<div class="text-center p-4 text-gray-500">暂无数据</div>';
        return;
    }

    filteredRequests.forEach((request, index) => {
        const listItem = document.createElement('div');
        // 确保每个项目有唯一ID
        const itemId = `request-item-${request.id}`;
        listItem.id = itemId;
        listItem.className = `p-3 border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition ${
      request.id === selectedRequestId ? 'bg-blue-100' : ''
    }`;
        listItem.dataset.id = request.id;

        // 创建时间标签
        const timeElement = document.createElement('div');
        timeElement.className = 'text-xs text-gray-500';
        const timeStr = new Date(request.timestamp).toLocaleTimeString();
        timeElement.textContent = timeStr;

        // 创建事件名称标签
        const eventElement = document.createElement('div');
        eventElement.className = 'font-medium truncate';
        eventElement.textContent = request.event || '未知事件';

        listItem.appendChild(timeElement);
        listItem.appendChild(eventElement);

        // 点击事件
        listItem.addEventListener('click', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();

            selectedRequestId = request.id;
            displayRequestDetails(request);

            // 添加点击动画效果
            listItem.classList.add('clicked');
            setTimeout(() => {
                listItem.classList.remove('clicked');
            }, 200);

            // 更新选中状态 - 重要：删除所有项目的选中状态，只保留当前项目
            document.querySelectorAll('#request-list > div').forEach(item => {
                item.classList.remove('bg-blue-100');
            });
            listItem.classList.add('bg-blue-100');
        });

        requestListElement.appendChild(listItem);
    });
}

// 显示请求详情
function displayRequestDetails(request) {
    if (!request) return;

    // 显示事件名称
    selectedEventElement.textContent = request.event || '未知事件';

    // 添加视觉反馈动画
    selectedEventElement.classList.add('highlight');
    setTimeout(() => {
        selectedEventElement.classList.remove('highlight');
    }, 500);

    // 格式化并显示JSON数据
    if (isJsonCompressed) {
        // 压缩模式 - 直接使用JSON字符串
        const jsonString = JSON.stringify(request.jsonData);
        jsonDisplayElement.textContent = jsonString;
    } else {
        // 格式化高亮模式
        try {
            // 将JSON对象美化并转换为HTML
            const formattedJson = formatJsonWithHighlight(request.jsonData);
            jsonDisplayElement.innerHTML = formattedJson;
        } catch (error) {
            console.error("格式化JSON出错:", error);
            // 退回到基本的JSON字符串显示
            jsonDisplayElement.textContent = JSON.stringify(request.jsonData, null, 2);
        }
    }

    // 淡入动画效果
    jsonDisplayElement.classList.add('fade-in');
    setTimeout(() => {
        jsonDisplayElement.classList.remove('fade-in');
    }, 300);

    // 显示复制按钮
    copyJsonButton.classList.remove('hidden');
}

// 切换JSON格式（格式化/压缩）
function toggleJsonFormat() {
    if (!selectedRequestId) return;

    const selectedRequest = allRequests.find(req => req.id === selectedRequestId);
    if (!selectedRequest) return;

    isJsonCompressed = !isJsonCompressed;

    // 添加切换动画
    jsonDisplayElement.classList.add('format-toggle');

    if (isJsonCompressed) {
        // 压缩模式
        jsonDisplayElement.textContent = JSON.stringify(selectedRequest.jsonData);
    } else {
        // 格式化高亮模式
        try {
            jsonDisplayElement.innerHTML = formatJsonWithHighlight(selectedRequest.jsonData);
        } catch (error) {
            console.error("格式化JSON出错:", error);
            jsonDisplayElement.textContent = JSON.stringify(selectedRequest.jsonData, null, 2);
        }
    }

    setTimeout(() => {
        jsonDisplayElement.classList.remove('format-toggle');
    }, 300);
}

// 复制JSON到剪贴板
function copyJsonToClipboard() {
    let jsonText;

    if (selectedRequestId) {
        const selectedRequest = allRequests.find(req => req.id === selectedRequestId);
        if (selectedRequest) {
            // 使用原始JSON对象格式化，确保中文正确显示
            jsonText = JSON.stringify(selectedRequest.jsonData, null, 2);
        } else {
            jsonText = jsonDisplayElement.textContent;
        }
    } else {
        jsonText = jsonDisplayElement.textContent;
    }

    navigator.clipboard.writeText(jsonText)
        .then(() => {
            // 显示复制成功提示
            const originalText = copyJsonButton.textContent;
            copyJsonButton.textContent = '已复制!';
            copyJsonButton.classList.add('copied');

            setTimeout(() => {
                copyJsonButton.textContent = originalText;
                copyJsonButton.classList.remove('copied');
            }, 1500);
        })
        .catch(err => {
            console.error('复制失败:', err);
            copyJsonButton.textContent = '复制失败';
            copyJsonButton.classList.add('copy-error');

            setTimeout(() => {
                copyJsonButton.textContent = '复制JSON';
                copyJsonButton.classList.remove('copy-error');
            }, 1500);
        });
}

// 格式化并高亮JSON
function formatJsonWithHighlight(jsonObj) {
    // 预处理HTML特殊字符
    function escapeHTML(str) {
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 尝试修复损坏的UTF-8字符串
    function fixBrokenUtf8(str) {
        // 检测是否可能是损坏的UTF-8（可能的乱码）
        if (/æ|ø|å|Ã|¢|€|¥|£|¤/.test(str)) {
            try {
                // 尝试将字符串转换为Latin-1编码的字节数组
                const latin1Bytes = new Uint8Array(str.length);
                for (let i = 0; i < str.length; i++) {
                    latin1Bytes[i] = str.charCodeAt(i) & 0xFF;
                }

                // 尝试将这些字节解释为UTF-8
                const textDecoder = new TextDecoder('utf-8');
                const fixed = textDecoder.decode(latin1Bytes);

                console.log("字符串修复前:", str);
                console.log("字符串修复后:", fixed);

                return fixed;
            } catch (e) {
                console.error("修复UTF-8字符串失败:", e);
                return str;
            }
        }
        return str;
    }

    // 递归处理不同类型的JSON值
    function processValue(value, indent = 0) {
        const indentStr = '  '.repeat(indent);

        if (value === null) {
            return `<span class="json-null">null</span>`;
        } else if (typeof value === 'boolean') {
            return `<span class="json-boolean">${value}</span>`;
        } else if (typeof value === 'number') {
            return `<span class="json-number">${value}</span>`;
        } else if (typeof value === 'string') {
            // 尝试修复可能损坏的UTF-8字符串
            const fixedValue = fixBrokenUtf8(value);
            return `<span class="json-string">"${escapeHTML(fixedValue)}"</span>`;
        } else if (Array.isArray(value)) {
            if (value.length === 0) {
                return `<span class="json-brackets">[]</span>`;
            }

            let result = `<span class="json-brackets">[</span>\n`;

            value.forEach((item, index) => {
                result += `${indentStr}  ${processValue(item, indent + 1)}`;
                if (index < value.length - 1) {
                    result += `<span class="json-punctuation">,</span>`;
                }
                result += '\n';
            });

            result += `${indentStr}<span class="json-brackets">]</span>`;
            return result;
        } else if (typeof value === 'object') {
            const keys = Object.keys(value);

            if (keys.length === 0) {
                return `<span class="json-brackets">{}</span>`;
            }

            let result = `<span class="json-brackets">{</span>\n`;

            keys.forEach((key, index) => {
                // 尝试修复键名中的UTF-8编码问题
                const fixedKey = fixBrokenUtf8(key);
                result += `${indentStr}  <span class="json-key">"${escapeHTML(fixedKey)}"</span><span class="json-punctuation">:</span> ${processValue(value[key], indent + 1)}`;
                if (index < keys.length - 1) {
                    result += `<span class="json-punctuation">,</span>`;
                }
                result += '\n';
            });

            result += `${indentStr}<span class="json-brackets">}</span>`;
            return result;
        }

        return escapeHTML(String(value));
    }

    // 为每行添加包装
    const formatted = processValue(jsonObj);
    const lines = formatted.split('\n');
    return lines.map(line => {
        return `<span class="json-line">${line}</span>`;
    }).join('\n');
}

// 搜索功能
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();

    if (searchTerm === '') {
        filteredRequests = [...allRequests];
    } else {
        filteredRequests = allRequests.filter(request =>
            (request.event && request.event.toLowerCase().includes(searchTerm))
        );
    }

    // 搜索反馈动画
    requestListElement.classList.add('search-effect');
    setTimeout(() => {
        requestListElement.classList.remove('search-effect');
    }, 300);

    renderRequestList();

    // 显示搜索结果数量
    const resultCount = filteredRequests.length;
    if (searchTerm !== '' && resultCount > 0) {
        requestListElement.insertAdjacentHTML('beforeend',
            `<div class="text-xs text-center p-2 text-gray-500">找到 ${resultCount} 条结果</div>`);
    }
}

// 清除所有请求
function clearAllRequests() {
    // 添加清除按钮动画
    clearButton.classList.add('clearing');

    chrome.runtime.sendMessage({ action: 'clearRequests' }, (response) => {
        if (response && response.success) {
            allRequests = [];
            filteredRequests = [];
            selectedRequestId = null;

            // 渐变动画
            requestCountElement.classList.add('fade-out');

            setTimeout(() => {
                requestCountElement.textContent = '0';
                requestCountElement.classList.remove('fade-out');

                jsonDisplayElement.textContent = '选择左侧事件查看详情\n\n如长时间未捕获请求，双击此区域查看调试信息';
                selectedEventElement.textContent = '未选择事件';
                copyJsonButton.classList.add('hidden');
                renderRequestList();
                clearButton.classList.remove('clearing');
            }, 300);
        }
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initialize);

// 双击空白JSON区域时显示调试信息
jsonDisplayElement.addEventListener('dblclick', function(e) {
    if (jsonDisplayElement.textContent.includes('选择左侧事件查看详情') ||
        jsonDisplayElement.textContent.includes('暂无数据')) {
        checkDebugInfo();
    }
});