import { ethers } from "ethers";
import { formatEther } from "ethers/lib/utils";

const walletRegExp = /^0x[a-fA-F0-9]{40}$/;

export interface verifyPaymentResponse {
    sucess: boolean;
    nonce: number;
    receipt: ethers.providers.TransactionReceipt;
    transferAmount: number;
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
    constructor(message: string) {
        super(ConfigurationError, message);
    }
}

class TransactionError extends _Error {
    constructor(message: string) {
        super(TransactionError, message);
    }
}

export class Web3Payments {
    private static _configured: boolean = false;
    private static _provider: ethers.providers.JsonRpcProvider;
    private static _recipientWallet: string;

    private static checkConnection() {
        if (!this._configured) {
            throw new ConfigurationError("Service not configured");
        }
    }

    public static configure(recipientWallet: string, rpcProviderUrl: string): void {
        if (!walletRegExp.test(recipientWallet)) {
            throw new ConfigurationError("The recipient's wallet is not a valid wallet address");
        }
        this._recipientWallet = recipientWallet;
        this._provider = new ethers.providers.JsonRpcProvider(rpcProviderUrl);
        this._configured = true;
    }

    public static async verifyPayment(txHash: string, prevPaymentNonce: number): Promise<verifyPaymentResponse> {
        this.checkConnection();

        const receipt = await this._provider.waitForTransaction(txHash);
        const tx = await this._provider.getTransaction(receipt.transactionHash);
        const transferAmount = +formatEther(tx.value);

        if (receipt.status === 0) {
            return { sucess: false, nonce: tx.nonce, transferAmount, receipt };
        }
        if (receipt.status === 1) {
            if (tx.to.toLocaleLowerCase() !== this._recipientWallet.toLocaleLowerCase()) {
                throw new TransactionError("The transfer was to a wallet that does not match the recipient wallet");
            }
            if (tx.nonce <= prevPaymentNonce) {
                throw new TransactionError("Payment for this transaction has already been made");
            }
            return { sucess: true, nonce: tx.nonce, transferAmount, receipt };
        }
    }

    public static get recipientWallet() {
        return this._recipientWallet;
    }
}
