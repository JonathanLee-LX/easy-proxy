'use strict'

const EasyCert = require('node-easy-cert');
const os = require('os');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const { mkdir, stat, mkdirSync, statSync } = require('fs');
const path = require('path');

const rootDirPath = path.resolve(os.homedir(), '.ep', 'ca');

const options = {
    rootDirPath: rootDirPath,
    inMemory: false,
    defaultCertAttrs: [
        { name: 'countryName', value: 'CN' },
        { name: 'organizationName', value: 'easy-proxy' },
        { shortName: 'ST', value: 'SH' },
        { shortName: 'OU', value: 'easy-proxy SSL Proxy' }
    ]
};

const easyCert = new EasyCert(options);
const crtMgr = Object.assign({}, easyCert);

// rename function
crtMgr.ifRootCAFileExists = easyCert.isRootCAFileExists;

async function doGenerate(overwrite) {
    const rootOptions = {
        commonName: 'easy-proxy',
        overwrite: overwrite
    };

    return new Promise((resolvePromise, reject) => {
        stat(rootDirPath, (err, stats) => {
            if (err) {
                mkdirSync(rootDirPath, { recursive: true })
            } else if (stats.isDirectory()) {
            }

            easyCert.generateRootCA(rootOptions, (error, keyPath, crtPath) => {
                if (error) reject(error)
                else resolvePromise({ keyPath, crtPath });
            });
        })
    })
}


async function getCAStatus() {
    const result = {
        exist: false,
    };
    const ifExist = easyCert.isRootCAFileExists();
    if (!ifExist) {
        return result;
    } else {
        result.exist = true;
        if (!/^win/.test(process.platform)) {
            result.trusted = easyCert.ifRootCATrusted;
        }
        return result;
    }
}

/**
 * trust the root ca by command
 */
function openCertForUser(rootCAPath) {
    const platform = os.platform();
    if (platform === 'darwin') {
        try {
            execSync(`open "${rootCAPath}"`, { stdio: 'inherit' });
            console.log('\n已打开证书文件，请在 Keychain Access 中：');
            console.log('  1. 双击证书 -> 展开「Trust」');
            console.log('  2. 将「When using this certificate」设为「Always Trust」');
            console.log('  3. 关闭窗口并输入密码保存\n');
        } catch (err) {
            console.log('证书路径:', rootCAPath);
        }
    } else if (platform === 'win32') {
        try {
            execSync(`start "" "${rootCAPath}"`, { stdio: 'inherit' });
            console.log('\n已打开证书，请按系统提示安装并信任。\n');
        } catch (err) {
            console.log('证书路径:', rootCAPath);
        }
    }
}

async function trustRootCA() {
    const platform = os.platform();
    const rootCAPath = crtMgr.getRootCAFilePath();

    const answer = await inquirer.prompt([
        {
            type: 'list',
            name: 'trustCA',
            message: '根证书尚未信任，请选择操作：',
            choices: [
                { name: '自动添加信任（需输入密码）', value: 'auto' },
                { name: '打开证书文件，手动添加信任', value: 'manual' },
                { name: '稍后自行处理', value: 'skip' }
            ]
        }
    ]);

    if (answer.trustCA === 'manual') {
        openCertForUser(rootCAPath);
        return;
    }

    if (answer.trustCA === 'skip') {
        console.log('证书路径:', rootCAPath, '- 请稍后手动添加信任以支持 HTTPS 代理。');
        return;
    }

    if (platform === 'darwin' && answer.trustCA === 'auto') {
        try {
            execSync(`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${rootCAPath}"`, {
                stdio: 'inherit'
            });
            console.log('根证书已成功添加到系统信任。');
        } catch (err) {
            console.error('自动添加失败，正在打开证书文件供手动添加...');
            openCertForUser(rootCAPath);
        }
    } else if (platform === 'win32' && answer.trustCA === 'auto') {
        openCertForUser(rootCAPath);
    }
}

async function ensureRootCA() {
    if (!crtMgr.ifRootCAFileExists()) {
        const { keyPath, crtPath } = await doGenerate(false)
        console.log('根证书已生成:', keyPath, crtPath)
    }

    const isTrusted = await new Promise((resolve, reject) => {
        crtMgr.ifRootCATrusted((err, trusted) => {
            if (err) resolve(false)
            else resolve(trusted)
        })
    })

    if (!isTrusted) {
        await trustRootCA()
    }
}

exports.ensureRootCA = ensureRootCA
exports.crtMgr = crtMgr