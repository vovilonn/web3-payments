import { ethers } from "ethers";
import { formatEther } from "ethers/lib/utils";

const walletRegExp = /^0x[a-fA-F0-9]{40}$/;

declare global {
    interface Error {
        details: any;
    }
}

export type GetNonceCb = (walletSender: string, transactionNonce: number) => number | Promise<number>;

export interface VerifyPaymentResponse {
    sucess: boolean;
    nonce: number;
    receipt: ethers.providers.TransactionReceipt;
    transferAmount: number;
}

export interface Configuration {
    recipientWallet: string;
    rpcProviderUrl: string;
    cb: GetNonceCb;
}

class _Error extends Error {
    public status: any;
    constructor(clazz, message: string) {
        super(message);
        this.name = clazz.name;
        Error.captureStackTrace(this, clazz);
    }
}

class ConfigurationError extends _Error {
    constructor(message: string, errCode?: number) {
        super(ConfigurationError, message);
        if (errCode) {
            this.details = { errCode };
        }
    }
}

class TransactionError extends _Error {
    constructor(message: string, errCode?: number) {
        super(TransactionError, message);
        if (errCode) {
            this.details = { errCode };
        }
    }
}

export class Web3Payments {
    private static _configured: boolean = false;
    private static _provider: ethers.providers.JsonRpcProvider;
    private static _recipientWallet: string;
    private static _getNonceByWalletSender: GetNonceCb;

    private static checkConnection() {
        if (!this._configured) {
            throw new ConfigurationError("Service not configured", 4000);
        }
    }

    public static configure({ recipientWallet, rpcProviderUrl, cb }: Configuration): void {
        if (!walletRegExp.test(recipientWallet)) {
            throw new ConfigurationError("The recipient's wallet is not a valid wallet address", 4001);
        }
        this._recipientWallet = recipientWallet;
        this._getNonceByWalletSender = cb;
        this._provider = new ethers.providers.JsonRpcProvider(rpcProviderUrl);
        this._configured = true;
    }

    public static async verifyPayment(txHash: string): Promise<VerifyPaymentResponse> {
        this.checkConnection();

        const receipt = await this._provider.waitForTransaction(txHash);
        const tx = await this._provider.getTransaction(receipt.transactionHash);
        const transferAmount = +formatEther(tx.value);

        if (receipt.status === 0) {
            return { sucess: false, nonce: tx.nonce, transferAmount, receipt };
        }
        if (receipt.status === 1) {
            if (tx.to.toLocaleLowerCase() !== this._recipientWallet.toLocaleLowerCase()) {
                throw new TransactionError(
                    "The transfer was to a wallet that does not match the recipient wallet",
                    5000
                );
            }
            const lastPaymentNonce = await this._getNonceByWalletSender(tx.from, tx.nonce);
            if (tx.nonce <= lastPaymentNonce) {
                throw new TransactionError("Payment for this transaction has already been made", 5001);
            }
            return { sucess: true, nonce: tx.nonce, transferAmount, receipt };
        }
    }

    public static get recipientWallet() {
        return this._recipientWallet;
    }
}
