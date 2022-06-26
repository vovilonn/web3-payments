import { ethers } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { JsonFragment } from "@ethersproject/abi/src.ts/fragments";

declare global {
    interface Error {
        details: any;
    }
}

export type CheckPaymentAvialability = (tx: ethers.providers.TransactionResponse) => boolean | Promise<boolean>;

export type ErrorCode = "INVALID_ADDR" | "CONFLICT_ADDR" | "UNAVAILABLE";

export interface VerifyPaymentResponse {
    sucess: boolean;
    transferAmount: number;
    tx: ethers.providers.TransactionResponse;
    receipt: ethers.providers.TransactionReceipt;
    decodedData?: any;
}

export interface Configuration {
    recipientWallet: string;
    rpcProviderUrl: string;
    checkPaymentAvialability: CheckPaymentAvialability;
    abi: string | readonly (string | ethers.utils.Fragment | JsonFragment)[];
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
    constructor(message: string, errCode?: ErrorCode) {
        super(ConfigurationError, message);
        if (errCode) {
            this.details = { errCode };
        }
    }
}

class TransactionError extends _Error {
    constructor(message: string, errCode?: ErrorCode) {
        super(TransactionError, message);
        if (errCode) {
            this.details = { errCode };
        }
    }
}

export class Web3Payments {
    private _provider: ethers.providers.JsonRpcProvider;
    private _recipientWallet: string;
    private _abi: string | readonly (string | ethers.utils.Fragment | JsonFragment)[];
    /**
     * description: Fuction to check if a payment has already been made
     */
    private _checkPaymentAvialability: CheckPaymentAvialability;

    constructor({ recipientWallet, rpcProviderUrl, checkPaymentAvialability, abi }: Configuration) {
        this._recipientWallet = recipientWallet;
        this._checkPaymentAvialability = checkPaymentAvialability;
        this._provider = new ethers.providers.JsonRpcProvider(rpcProviderUrl);
        this._abi = abi;
    }

    public decodeTxData(data: string): ethers.utils.Result {
        const iface = new ethers.utils.Interface(this._abi);
        return iface.decodeFunctionData(data.slice(0, 10), data);
    }

    public async verifyPayment(txHash: string, timeout: number = 10000): Promise<VerifyPaymentResponse> {
        const receipt = await this._provider.waitForTransaction(txHash, null, timeout);
        const tx = await this._provider.getTransaction(receipt.transactionHash);
        const transferAmount = +formatEther(tx.value);

        if (receipt.status === 0) {
            return { sucess: false, transferAmount, receipt, tx };
        }
        if (receipt.status === 1) {
            const decodedData = this.decodeTxData(tx.data);

            if (
                tx.to.toLowerCase() !== this._recipientWallet.toLowerCase() &&
                decodedData?.recipient?.toLowerCase() !== this._recipientWallet.toLowerCase()
            ) {
                throw new TransactionError(
                    "The transfer was to a wallet that does not match the recipient wallet",
                    "CONFLICT_ADDR"
                );
            }
            const paymentIsAvialable = await this._checkPaymentAvialability(tx);
            if (!paymentIsAvialable) {
                throw new TransactionError("Payment for this transaction has already been made", "UNAVAILABLE");
            }
            return { sucess: true, transferAmount, receipt, tx, decodedData };
        }
    }

    public get recipientWallet() {
        return this._recipientWallet;
    }

    public get provider() {
        return this._provider;
    }
}
