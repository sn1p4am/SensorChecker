// 存储符合条件的请求
let requests = [];
let requestCount = 0;
let preserveDataOnNavigation = false; // 默认不保留记录
let tabUrlMap = new Map(); // 存储每个标签页的URL，用于检测刷新

// 使用webNavigation API监听页面导航事件
chrome.webNavigation.onCommitted.addListener((details) => {
    // 只处理主框架的导航
    if (details.frameId !== 0) return;

    console.log(`页面导航事件: tabId=${details.tabId}, url=${details.url}, type=${details.transitionType}`);

    // 检测页面刷新 - transitionType为reload表示刷新
    if (details.transitionType === 'reload') {
        console.log(`检测到页面刷新: tabId=${details.tabId}, url=${details.url}`);
        resetData("页面刷新，重置数据");
    }
    // 检测页面跳转 - 除非用户开启了保留记录功能，否则清空
    else if (!preserveDataOnNavigation) {
        console.log(`检测到页面跳转: tabId=${details.tabId}, url=${details.url}, type=${details.transitionType}`);
        resetData("页面跳转，重置数据");
    }
});

// 额外添加历史状态变化监听，捕获单页应用的页面变化
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    // 只处理主框架的导航
    if (details.frameId !== 0) return;

    console.log(`历史状态变化: tabId=${details.tabId}, url=${details.url}`);

    if (!preserveDataOnNavigation) {
        resetData("单页应用导航，重置数据");
    }
});

// 监听标签URL变化，检测导航
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 确保有URL变化且不是初始加载
    if (changeInfo.url) {
        console.log(`标签URL变化: tabId=${tabId}, newUrl=${changeInfo.url}`);

        if (tabUrlMap.has(tabId)) {
            const oldUrl = tabUrlMap.get(tabId);
            const newUrl = changeInfo.url;

            // 如果域名改变，则认为是站点跳转
            const oldDomain = getDomain(oldUrl);
            const newDomain = getDomain(newUrl);

            if (oldDomain !== newDomain && !preserveDataOnNavigation) {
                console.log(`检测到域名变化: ${oldDomain} -> ${newDomain}`);
                resetData("域名变化，重置数据");
            }
        }

        // 更新URL映射
        tabUrlMap.set(tabId, changeInfo.url);
    }
});

// 获取URL的域名部分
function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return url;
    }
}

// 监听标签关闭，清理对应数据
chrome.tabs.onRemoved.addListener((tabId) => {
    tabUrlMap.delete(tabId);
});

// 重置数据的函数
function resetData(reason) {
    console.log(reason);
    requests = [];
    requestCount = 0;
    chrome.storage.local.set({ requests, requestCount });
    updateBadge();
}

// 请求监听函数
function handleRequest(details) {
    console.log("检测到请求:", details.url);

    // 检查URL是否包含目标特征
    if (details.url.includes('/sa.gif?project')) {
        console.log("发现符合条件的请求:", details.url);
        try {
            // 获取请求数据
            let formData = '';

            // 处理GET请求
            if (details.method === 'GET' && details.url.includes('?')) {
                formData = details.url.split('?')[1];
                console.log("GET请求参数:", formData);
            }
            // 处理POST请求
            else if (details.method === 'POST') {
                if (details.requestBody) {
                    if (details.requestBody.formData) {
                        formData = new URLSearchParams(details.requestBody.formData).toString();
                        console.log("POST formData:", formData);
                    } else if (details.requestBody.raw) {
                        // 处理raw请求体
                        const encoder = new TextDecoder("utf-8");
                        const raw = details.requestBody.raw.map(
                            chunk => encoder.decode(new Uint8Array(chunk.bytes))
                        ).join('');
                        formData = raw;
                        console.log("POST raw数据:", formData);
                    }
                }
            }

            // 尝试从URL或请求体中找到data参数
            let dataParam = '';

            // 先尝试完整匹配
            let dataMatch = /data=([^&]+)(?=&ext=crc%3D1603820112|$)/.exec(formData);

            // 如果没找到，尝试简单匹配data参数
            if (!dataMatch) {
                dataMatch = /data=([^&]+)/.exec(formData);
                console.log("简单匹配data:", dataMatch);
            }

            // 如果找到data参数
            if (dataMatch && dataMatch[1]) {
                const encodedData = dataMatch[1];
                console.log("提取到的data参数:", encodedData);

                try {
                    // 解码处理：先URL解码，再Base64解码
                    const urlDecoded = decodeURIComponent(encodedData);
                    console.log("URL解码后:", urlDecoded);

                    // Base64解码 - 使用更安全的方法处理中文
                    let base64Decoded;
                    try {
                        // 标准atob解码
                        base64Decoded = atob(urlDecoded);

                        // 检查解码后的内容是否包含UTF-8编码的多字节字符
                        const isUTF8 = /[\u0080-\uFFFF]/.test(base64Decoded);

                        if (isUTF8) {
                            // 如果包含非ASCII字符，可能是UTF-8编码，需要转换
                            console.log("检测到非ASCII字符，尝试UTF-8转换...");

                            // 将字符串转换为UTF-8字节数组
                            const bytes = new Uint8Array(base64Decoded.length);
                            for (let i = 0; i < base64Decoded.length; i++) {
                                bytes[i] = base64Decoded.charCodeAt(i);
                            }

                            // 使用TextDecoder将UTF-8字节数组转换为正确的字符串
                            const textDecoder = new TextDecoder('utf-8');
                            base64Decoded = textDecoder.decode(bytes);
                            console.log("UTF-8转换后:", base64Decoded.substring(0, 100) + "...");
                        } else {
                            console.log("Base64解码后(ASCII):", base64Decoded.substring(0, 100) + "...");
                        }
                    } catch (e) {
                        console.error("标准Base64解码失败，尝试替代方法:", e);

                        // 替代方法：使用更现代的方式转换Base64
                        try {
                            // 先将Base64转换为二进制字符串
                            const binaryString = atob(urlDecoded);
                            // 创建一个Uint8Array来存储二进制数据
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }
                            // 使用TextDecoder将UTF-8字节数组转换为字符串
                            const textDecoder = new TextDecoder('utf-8');
                            base64Decoded = textDecoder.decode(bytes);
                            console.log("替代Base64解码后:", base64Decoded.substring(0, 100) + "...");
                        } catch (alternativeError) {
                            console.error("替代Base64解码也失败:", alternativeError);
                            // 回退到原始方法
                            base64Decoded = atob(urlDecoded);
                            console.log("回退到原始解码:", base64Decoded.substring(0, 100) + "...");
                        }
                    }

                    // 输出完整解码日志，方便调试
                    console.log("Base64解码完整结果:", base64Decoded);

                    // 解析为JSON
                    const jsonData = JSON.parse(base64Decoded);

                    // 获取event值
                    const eventValue = jsonData.event || '未知事件';
                    console.log("提取的事件:", eventValue);

                    // 存储请求数据
                    const requestData = {
                        id: Date.now(),
                        timestamp: new Date().toISOString(),
                        event: eventValue,
                        url: details.url,
                        jsonData: jsonData
                    };

                    requests.unshift(requestData); // 新请求添加到数组前面
                    requestCount++;

                    // 只保留最近100条记录
                    if (requests.length > 100) {
                        requests.pop();
                    }

                    // 更新存储
                    chrome.storage.local.set({ requests, requestCount });

                    // 更新图标角标
                    updateBadge();

                    console.log("请求处理成功，当前请求数:", requestCount);
                } catch (decodeError) {
                    console.error("数据解码或解析失败:", decodeError);
                }
            } else {
                console.log("未找到data参数");
            }
        } catch (error) {
            console.error('解析请求数据出错:', error);
        }
    }
}

// 监听网络请求 - 使用两种监听方式以确保捕获
chrome.webRequest.onBeforeRequest.addListener(
    handleRequest, { urls: ["<all_urls>"] }, ["requestBody"]
);

// 更新图标角标
function updateBadge() {
    chrome.action.setBadgeText({ text: requestCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#FF5722' });
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getRequests') {
        sendResponse({ requests, requestCount });
    } else if (message.action === 'clearRequests') {
        resetData("手动清除数据");
        sendResponse({ success: true });
    } else if (message.action === 'getDebugInfo') {
        sendResponse({
            requestCount,
            lastError: chrome.runtime.lastError,
            hasPermissions: true,
            preserveDataOnNavigation,
            tabsTracked: Array.from(tabUrlMap.keys()).length,
            debugInfo: '已修复页面刷新/跳转重置问题'
        });
    } else if (message.action === 'setPreserveData') {
        preserveDataOnNavigation = !!message.value;
        // 保存设置
        chrome.storage.local.set({ preserveDataOnNavigation });
        console.log(`保留导航数据设置已更新: ${preserveDataOnNavigation}`);
        sendResponse({ success: true, preserveDataOnNavigation });
    } else if (message.action === 'getPreserveData') {
        sendResponse({ preserveDataOnNavigation });
    }
    return true;
});

// 初始化：从存储中加载请求数据和设置
chrome.storage.local.get(['requests', 'requestCount', 'preserveDataOnNavigation'], (result) => {
    if (result.requests) requests = result.requests;
    if (result.requestCount) requestCount = result.requestCount;
    if (result.preserveDataOnNavigation !== undefined) {
        preserveDataOnNavigation = result.preserveDataOnNavigation;
    }
    updateBadge();
    console.log("插件已初始化，加载历史请求数:", requestCount, "保留记录设置:", preserveDataOnNavigation);
});