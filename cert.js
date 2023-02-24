'use strict'

const EasyCert = require('node-easy-cert');
const os = require('os');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const { mkdir, stat, mkdirSync, statSync } = require('fs');
const { resolve } = require('path');

const rootDirPath = resolve(os.homedir(), './.jlx/ca');

const options = {
    rootDirPath: rootDirPath,
    inMemory: false,
    defaultCertAttrs: [
        { name: 'countryName', value: 'CN' },
        { name: 'organizationName', value: 'jlx' },
        { shortName: 'ST', value: 'SH' },
        { shortName: 'OU', value: 'jlx SSL Proxy' }
    ]
};

const easyCert = new EasyCert(options);
const crtMgr = Object.assign({}, easyCert);

// rename function
crtMgr.ifRootCAFileExists = easyCert.isRootCAFileExists;

async function doGenerate(overwrite) {
    const rootOptions = {
        commonName: 'jlx',
        overwrite: overwrite
    };

    return new Promise((resolve, reject) => {
        stat(rootDirPath, (err, stats) => {
            if (err) {
                mkdirSync(resolve(rootDirPath), { recursive: true })
            } else if (stats.isDirectory()) {
            }

            easyCert.generateRootCA(rootOptions, (error, keyPath, crtPath) => {
                if (error) reject(error)
                else resolve({ keyPath, crtPath });
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
async function trustRootCA() {
    const platform = os.platform();
    const rootCAPath = crtMgr.getRootCAFilePath();
    const trustInquiry = [
        {
            type: 'list',
            name: 'trustCA',
            message: 'The rootCA is not trusted yet, install it to the trust store now?',
            choices: ['Yes', "No, I'll do it myself"]
        }
    ];

    if (platform === 'darwin') {
        const answer = await inquirer.prompt(trustInquiry);
        if (answer.trustCA === 'Yes') {
            //   logUtil.info('About to trust the root CA, this may requires your password');
            // https://ss64.com/osx/security-cert.html
            const result = execSync(`sudo security add-trusted-cert -d -k /Library/Keychains/System.keychain ${rootCAPath}`);
            if (result.status === 0) {
                // logUtil.info('Root CA install, you are ready to intercept the https now');
            } else {
                console.error(result);
                // logUtil.info('Failed to trust the root CA, please trust it manually');
                // util.guideToHomePage();
            }
        } else {
            //   logUtil.info('Please trust the root CA manually so https interception works');
            //   util.guideToHomePage();
        }
    }


    if (/^win/.test(process.platform)) {
        // logUtil.info('You can install the root CA manually.');
    }
    //   logUtil.info('The root CA file path is: ' + crtMgr.getRootCAFilePath());
}

async function ensureRootCA() {
    if (!crtMgr.ifRootCAFileExists()) {
        const { keyPath, crtPath } = await doGenerate(false)
        console.log(keyPath, crtPath)
    }
    if (!crtMgr.ifRootCATrusted()) {
        trustRootCA()
    }
}

exports.ensureRootCA = ensureRootCA
exports.crtMgr = crtMgr