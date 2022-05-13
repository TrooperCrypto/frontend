import React, { useEffect, useState, useMemo } from "react";
import {
  constants as ethersConstants,
  utils as ethersUtils
} from 'ethers';
import { useSelector } from "react-redux";
import isEmpty from "lodash/isEmpty";
import { SwapButton, Button, useCoinEstimator } from "components";
import {
  networkSelector,
  balancesSelector,
} from "lib/store/features/api/apiSlice";
import Loader from "react-loader-spinner";
import { userSelector } from "lib/store/features/auth/authSlice";
import api from "lib/api";
import { MAX_ALLOWANCE } from "lib/api/constants";
import { formatUSD, formatPrice } from "lib/utils";
import cx from "classnames";
import { BiError } from "react-icons/bi";
import { MdSwapCalls } from "react-icons/md";
import BridgeSwapInput from "../BridgeSwapInput/BridgeSwapInput";
import ConnectWalletButton from "../../../atoms/ConnectWalletButton/ConnectWalletButton";
import Pane from "../../../atoms/Pane/Pane";
import { x } from "@xstyled/styled-components";
import RadioButtons from "../../../atoms/RadioButtons/RadioButtons";
import L2Header from "./L2Header";
import L1Header from "./L1Header";
import FastWithdrawTooltip from "./FastWithdrawTooltip";
import {
  NETWORKS,
  ZKSYNC_ETHEREUM_FAST_BRIDGE,
  ZKSYNC_POLYGON_BRIDGE
} from "./constants"
import { toast } from "react-toastify";

const defaultTransfer = {
  type: "deposit",
};

const Bridge = () => {
  const user = useSelector(userSelector);
  const balanceData = useSelector(balancesSelector);
  const [loading, setLoading] = useState(false);
  const [isApproving, setApproving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [L2Fee, setL2Fee] = useState(null);
  const [L2FeeToken, setL2FeeToken] = useState(null);
  const [L1Fee, setL1Fee] = useState(null);
  const network = useSelector(networkSelector);
  const [transfer, setTransfer] = useState(defaultTransfer);
  const [swapCurrencyInfo, setSwapCurrencyInfo] = useState({ decimals: 0 });
  const [allowance, setAllowance] = useState(ethersConstants.Zero);
  const [hasAllowance, setHasAllowance] = useState(false);
  const [fromNetwork, setFromNetwork] = useState(NETWORKS[0])
  const [toNetwork, setToNetwork] = useState(fromNetwork.to[0])
  const [balances, setBalances] = useState([]);
  const [altBalances, setAltBalances] = useState([]);
  const [polygonLoding, setPolygonLoading] = useState(false)
  const [swapDetails, _setSwapDetails] = useState(() => ({
    amount: "",
    currency: "ETH",
  }));
  const [hasError, setHasError] = useState(false);
  const [activationFee, setActivationFee] = useState(0);
  const [usdFee, setUsdFee] = useState(0);
  const [switchClicking, setSwitchClicking] = useState(false);
  const [gasFetching, setGasFetching] = useState(false);

  const coinEstimator = useCoinEstimator();
  const currencyValue = coinEstimator(swapDetails.currency);

  const estimatedValue =
    +swapDetails.amount * coinEstimator(swapDetails.currency) || 0;
  const [fastWithdrawCurrencyMaxes, setFastWithdrawCurrencyMaxes] = useState(
    {}
  );

  const walletBalances = useMemo(()=> (balanceData.wallet) ? balanceData.wallet : {}, [balanceData.wallet])
  const zkBalances = useMemo(()=> (balanceData[network]) ? balanceData[network] : {} , [balanceData, network])
  const polygonBalances = useMemo(()=> (balanceData.polygon) ? balanceData.polygon : {}, [balanceData.polygon])

  const _getBalances = (_network) => {
    let balances = [];
    if (_network === "polygon") {
      balances = polygonBalances;
    } else if (_network === "ethereum") {
      balances = walletBalances;
    } else if (_network === "zksync") {
      balances = zkBalances;
    } else {
      setFormErr("Bad Network");
    }
    return balances;

  }

  useEffect(async()=> {
    if(!user.address) return;
    setBalances(_getBalances(fromNetwork.from.key));
    setAltBalances(_getBalances(toNetwork.key));
  }, [toNetwork, user.address, walletBalances, zkBalances, polygonBalances])

  const [withdrawSpeed, setWithdrawSpeed] = useState("fast");
  const isFastWithdraw = () => {
    return (withdrawSpeed === "fast" &&
      transfer.type === "withdraw" &&
      api.apiProvider.eligibleFastWithdrawTokens.includes(swapDetails.currency));
  }
 
  useEffect(()=>{
    setHasError(formErr && formErr.length > 0);
  }, [formErr])

  const isSwapAmountEmpty = swapDetails.amount === "";

  useEffect(()=>{
    setHasAllowance(
      balances[swapDetails.currency] &&
      balances[swapDetails.currency].allowance.gte(MAX_ALLOWANCE.div(3))
    );
  }, [toNetwork, swapDetails])

  useEffect(()=>{
    if(fromNetwork.from.key === 'zksync'){    
      const type = transfer.type = "withdraw";
      setTransfer({ type });
    }
    else{
      api.getWalletBalances()
      const type = transfer.type = "deposit";
      setTransfer({ type });
    }

    if (fromNetwork.from.key === 'polygon') {
      api.getPolygonWethBalance()
      setSwapDetails({ amount: '', currency: 'WETH' })
    }
    else if (fromNetwork.from.key === 'ethereum') {
      api.getWalletBalances()
      const currency = switchClicking? swapDetails.currency: 'ETH';
      setSwapDetails({ amount: '', currency });
      
    }
    else if (fromNetwork.from.key === 'zksync' && toNetwork.key === 'ethereum') {
      const currency = switchClicking? swapDetails.currency: 'ETH';
      setSwapDetails({ amount: '', currency });
    }
    else if (fromNetwork.from.key === 'zksync' && toNetwork.key === 'polygon') {
      setSwapDetails({ amount: '', currency: 'ETH' });
    }
    setSwitchClicking(false);
  }, [toNetwork])

  useEffect(() => {
    let _swapCurrencyInfo = {}
    if (swapDetails.currency === 'WETH'){
      _swapCurrencyInfo = api.getCurrencyInfo('ETH');
    }
    else {
      _swapCurrencyInfo = api.getCurrencyInfo(swapDetails.currency);
    }

    setSwapCurrencyInfo(_swapCurrencyInfo)
    
    if (swapDetails.currency === "ETH") {
      setAllowance(MAX_ALLOWANCE);
      setHasAllowance(true);
      return;
    }
    if (isEmpty(balances) || !swapDetails.currency) {
      return;
    }


    const swapAmountBN = ethersUtils.parseUnits(
      isSwapAmountEmpty ? '0.0' : swapDetails.amount,
      _swapCurrencyInfo?.decimals
    );
    const allowanceBN = balances[swapDetails.currency]?.allowance ?? ethersConstants.Zero;
    setAllowance(allowanceBN);
    setHasAllowance(allowanceBN.gte(swapAmountBN));
  }, [balances, swapDetails, isSwapAmountEmpty]);

  useEffect(() => {
    if (user.address) {
      api.getL2FastWithdrawLiquidity().then((maxes) => {
        setFastWithdrawCurrencyMaxes(maxes);
      });
      calculateFees();
    }
  }, [user.address]);

  useEffect(() => {
    calculateFees();
    if (withdrawSpeed === "normal") {
      setL1Fee(null);
    }
  }, [withdrawSpeed]);

  useEffect(async () => {
    if (
      !api.apiProvider.eligibleFastWithdrawTokens?.includes(swapDetails.currency)
    ) {
      setWithdrawSpeed("normal");
    } else {
      setWithdrawSpeed("fast");
    }

    // update changePubKeyFee fee if needed
    if (
      user.address &&
      !user.id &&
      api.apiProvider?.zksyncCompatible
    ) {
      const usdFee = await api.apiProvider.changePubKeyFee();
      setUsdFee(usdFee);
      setActivationFee((usdFee / currencyValue).toFixed(5));
    }
  }, [swapDetails.currency]);

  useEffect(()=>{
    calculateFees();
  }, [swapDetails.amount, swapDetails.currency]);

  const validateInput = (inputValue, swapCurrency) => {
    if (balances.length === 0) return false;
    const getCurrencyBalance = (cur) => (balances[cur] && swapCurrencyInfo?.decimals ? balances[cur].value / (10 ** (swapCurrencyInfo.decimals)) : 0);
    const detailBalance = getCurrencyBalance(swapCurrency);

    let error = null;
    if (inputValue > 0) {
      if (inputValue <= activationFee) {
        error = `Must be more than ${activationFee} ${swapCurrency}`
      } else if (L2Fee !== null && inputValue < L2Fee) {
        error = "Amount too small";
      } else if (inputValue >= detailBalance) {
        error = "Insufficient balance";
      } else if (isFastWithdraw()) {
        if (toNetwork.key !== 'polygon' && L1Fee !== null  && inputValue < L1Fee) {
          error = "Amount too small";
        }

        if (swapDetails.currency in fastWithdrawCurrencyMaxes) {
          const maxAmount = fastWithdrawCurrencyMaxes[swapCurrency];
          if (inputValue > maxAmount) {
            error = `Max ${swapCurrency} liquidity for fast withdraw: ${maxAmount.toPrecision(
              4
            )}`;
          } else if (toNetwork.key !== 'polygon' && L1Fee !== null && L2Fee !== null && inputValue < (L2Fee + L1Fee)) {
            error = "Amount too small";
          }
        }
      } else if (L2FeeToken !== null && L2FeeToken === swapCurrency) {
        if (L2Fee !== null && (inputValue + L2Fee) > detailBalance) {
          error = "Insufficient balance for fees";
        }
      } else if(L2FeeToken !== null){
        const feeCurrencyBalance = getCurrencyBalance(L2FeeToken);
        if (L1Fee != null && feeCurrencyBalance < L1Fee) {
          error = "Insufficient balance for fees";
        }
      }
      /*else if (L1Fee !== null  && inputValue < L1Fee) {
        error = "Amount too small";
      }*/
      else if (inputValue < 0.0001 && (fromNetwork.from.key === 'polygon' || toNetwork.key === 'polygon')) {
        error = "Insufficient amount";
      }
    }

    if (error) {
      setFormErr(error);
      return false;
    }
    return true;
  };

  const validateFees = (inputValue, bridgeFee, feeCurrency) => {
    const feeCurrencyInfo = api.getCurrencyInfo(feeCurrency);
    if (balances.length === 0) return false;
    const feeTokenBalance = parseFloat(balances[feeCurrency] && balances[feeCurrency].value / (10 ** feeCurrencyInfo.decimals))

    if (
      inputValue > 0 &&
      bridgeFee > feeTokenBalance
    ) {
      setFormErr("Not enough balance to pay for fees")
      return false;
    }
    return true;
  };

  const setFastWithdrawFees = async (details) => {
    try{
      let res = await api.withdrawL2FastGasFee(details.currency);
      setFee(details, res.amount, res.feeToken);
    }catch(e){
      console.error(e);
      setL2FeeToken(null);
      setFee(details, null, null);
    }

    if(toNetwork.key !== 'polygon'){
      try{
        let res = await api.withdrawL2FastBridgeFee(details.currency);
        setL1Fee(res);
      }catch(e) {
        console.error(e);
        setL1Fee(null);
      }
    }
    else {
      setL1Fee(null);
    }
  };

  const setNormalWithdrawFees = async (details) => {
    try{
      let res = await api.withdrawL2GasFee(details.currency);
      setFee(details, res.amount, res.feeToken);
    }catch(err) {
      console.log(err);
      setL2FeeToken(null);
      setFee(details, null, null);
    }
  };

  const setFee = (details, bridgeFee, feeToken) => {
    setL2Fee(bridgeFee)
    setL2FeeToken(feeToken)
    const input = parseFloat(details.amount) || 0
    const isInputValid = validateInput(input, details.currency)
    const isFeesValid = validateFees(input, bridgeFee, feeToken)
    if (isFeesValid && isInputValid) {
      setFormErr("");
    } 
  };

  const setSwapDetails = async (values) => {
    const details = {
      ...swapDetails,
      ...values,
    };

    _setSwapDetails(details);
  }

  const calculateFees = async() => {
    const input = parseFloat(swapDetails.amount) || 0
    if ((input > 0 && input < 0.0001) && (fromNetwork.from.key === 'polygon' || toNetwork.key === 'polygon')) {
      setFormErr("Insufficient amount");
      return;
    }
    else if(swapDetails.amount.includes('0.000') && input === 0){
      setFormErr("");
      return;
    }

    setL1Fee(null);

    setGasFetching(true);

    if(fromNetwork.from.key === 'polygon') {
      const gasFee = await api.getPolygonFee();
      if(gasFee){
        setL1Fee(35000 * gasFee.fast.maxFee / 10**9);
        setFee(swapDetails, 0, null)
      }
    }
    else if (transfer.type === "withdraw") {
      if (api.apiProvider.syncWallet) {
        if (isFastWithdraw()) {
          await setFastWithdrawFees(swapDetails);
        } else {
          await setNormalWithdrawFees(swapDetails);
        }
      }
    } else {
      const gasFee = await api.depositL2Fee(swapDetails.currency);
      if(gasFee){
        let maxFee = (gasFee.maxFeePerGas) / 10**9;
        //For deposit, ethereum gaslimit is 90000. not sure why it's not 21000. 
        // To get the close gasfee, I used 46000 for gas limit.
        setL1Fee(46000 * maxFee / 10**9); 
        setFee(swapDetails, null, null)
      }
    }

    setGasFetching(false);
  }

  const switchTransferType = (e) => {    
      const f = NETWORKS.find(i => i.from.key === toNetwork.key)
      setFromNetwork(f)
      setToNetwork(fromNetwork.from)
      setSwitchClicking(true);
  };

  const approveSpend = (e) => {
    if (e) e.preventDefault();
    setApproving(true);
    api
      .approveSpendOfCurrency(swapDetails.currency)
      .then(() => {
        setApproving(false);
      })
      .catch((err) => {
        console.log(err);
        setApproving(false);
      });
  };

  const renderGuidContent = () => {
    return <div>
      <p style={{fontSize: '14px', lineHeight:'24px'}}>1. Switch to Polygon network</p>
      <p style={{fontSize: '14px', lineHeight:'24px'}}>2. Sign the transaction and wait for confirmation</p>
      <p style={{fontSize: '14px', lineHeight:'24px'}}>3. Wait until "Switch Network" pops up</p>
      <p style={{fontSize: '14px', lineHeight:'24px'}}>4. Switch back to Ethereum mainnet. Activating a new zkSync wallet costs ~$5. Enjoy trading on ZigZag!</p>
    </div>
  }

  const doTransfer = (e) => {
    e.preventDefault();
    let deferredXfer;
    setLoading(true);
    if (fromNetwork.from.key === "polygon" && toNetwork.key === "zksync") {
      setPolygonLoading(true)
      deferredXfer = api.transferPolygonWeth(`${swapDetails.amount}`, user.address)
      toast.info(
        renderGuidContent(),
        {
          closeOnClick: false,
          autoClose: 15000,
        },
      );
    } else if (fromNetwork.from.key === "zksync" && toNetwork.key === "polygon") {
      deferredXfer = api.transferToBridge(
        `${swapDetails.amount}`,
        swapDetails.currency,
        ZKSYNC_POLYGON_BRIDGE.address,
        user.address
      );
    } else if (fromNetwork.from.key === "ethereum" && toNetwork.key === "zksync") {
      deferredXfer = api.depositL2(
        `${swapDetails.amount}`,
        swapDetails.currency,
        user.address
      );
    } else if (fromNetwork.from.key === "zksync" && toNetwork.key === "ethereum") {
      if (isFastWithdraw()) {
        deferredXfer = api.transferToBridge(
          `${swapDetails.amount}`,
          swapDetails.currency,
          ZKSYNC_ETHEREUM_FAST_BRIDGE.address,
          user.address
        );
      } else {
        deferredXfer = api.withdrawL2(
          `${swapDetails.amount}`,
          swapDetails.currency
        );
      }
    } else {
      setFormErr("Wrong from/to combination")
      return false;
    }


    deferredXfer
      .then(() => {
        setTimeout(() => api.getAccountState(), 1000);
      })
      .catch((e) => {
        console.error("error sending transaction::", e);
        setTimeout(() => api.getAccountState(), 1000);
      })
      .finally(() => {
        setPolygonLoading(false)
        setLoading(false);
      });
  };

  const onSelectFromNetwork = ({ key }) => {
    const f = NETWORKS.find((i) => i.from.key === key)
    setFromNetwork(f)
    setToNetwork(f.to[0])
  };

  const onSelectToNetwork = ({ key }) => {
    const t = fromNetwork.to.find((i) => i.key === key)
    setToNetwork(t)
  }

  const getToBalance = () => {
    let balance, unit;
    if(fromNetwork.from.key === "polygon") {
      balance = altBalances["ETH"] ? altBalances["ETH"].valueReadable : '0.00'
      unit = "ETH";
    } 
    else if(toNetwork.key === "polygon") {
      balance = altBalances["WETH"] ? altBalances["WETH"].valueReadable : '0.00'
      unit = "WETH";
    } 
    else {
      balance = altBalances[swapDetails.currency] ? altBalances[swapDetails.currency].valueReadable : '0.00'
      unit = swapDetails.currency;
    }
    
    return balance + " " + unit;
  }

  return (
    <>
      <div className="bridge_box">
        <Pane size={"md"} variant={"light"}>
          <div className="bridge_coin_title">
            <h5>FROM</h5>
            <L1Header networks={NETWORKS} onSelect={onSelectFromNetwork} selectedNetwork={fromNetwork} />
          </div>
          <BridgeSwapInput
            L1Fee={L1Fee}
            L2Fee={L2Fee}
            balances={balances}
            value={swapDetails}
            onChange={setSwapDetails}
            feeCurrency={L2FeeToken}
            isOpenable={!(fromNetwork.from.key === "polygon" || (fromNetwork.from.key === "zksync" && toNetwork.key === "polygon"))}
            gasFetching={gasFetching}
          />
          <div className="bridge_coin_stats">
            <div className="bridge_coin_stat">
              <h5>Estimated value</h5>
              <span>~${formatUSD(estimatedValue)}</span>
            </div>
            {(
              swapDetails.currency !== "ETH" &&
              (swapCurrencyInfo?.decimals ? swapDetails.amount * 10 ** swapCurrencyInfo?.decimals : 0) > allowance
            ) ? (
              <div className="bridge_coin_stat">
                <h5>Available allowance</h5>
                <span>
                  {ethersUtils.formatUnits(allowance, swapCurrencyInfo?.decimals)}
                  {` ${swapDetails.currency}`}
                </span>
              </div>
            ) : null}
            <div className="bridge_coin_stat">
              <h5>Available balance</h5>
              <span>
                {balances[swapDetails.currency] ?
                  balances[swapDetails.currency].valueReadable : '0.00'}
                {` ${swapDetails.currency}`}
              </span>
            </div>
          </div>
        </Pane>

        <Pane size={"md"} borderRadius={"0 0 3xl 3xl"}>
          <div className="bridge_box_swap_wrapper">
            <SwapButton onClick={switchTransferType} />
            <h5>Switch</h5>
          </div>

          <div className="bridge_coin_stats">
            <div className="bridge_coin_stat">
              <div className="bridge_coin_details">
                <div className="bridge_coin_title">
                  <h5>TO</h5>
                  <L2Header networks={fromNetwork.to} selectedNetwork={toNetwork} onSelect={onSelectToNetwork} />
                </div>
              </div>
            </div>
            <div className="bridge_coin_stat">
              <h5>Available balance</h5>
              <span>
                {getToBalance()}
              </span>
            </div>
          </div>
          <x.div
            flexDirection={"column"}
            display={"flex"}
            alignItems={"flex-end"}
          >
            {fromNetwork.from.key === 'zksync' && toNetwork.key === 'ethereum' && (
              <>
                <RadioButtons
                  horizontal
                  value={withdrawSpeed}
                  onChange={setWithdrawSpeed}
                  name={"withdrawSpeed"}
                  items={[
                    {
                      id: "fast",
                      name: "Fast",
                      disabled:
                        !api.apiProvider.eligibleFastWithdrawTokens?.includes(
                          swapDetails.currency
                        ),
                    },
                    { id: "normal", name: "Normal" },
                  ]}
                />
                <x.div display={"flex"} mt={2}>
                  <x.div fontSize={12} color={"blue-gray-500"}>
                    Withdraw speed
                  </x.div>
                  <FastWithdrawTooltip />
                </x.div>
              </>
            )}
          </x.div>
          {transfer.type === "deposit" && user.address && !user.id && (
            <div className="bridge_transfer_fee">
              One-Time Activation Fee: {activationFee} {swapDetails.currency}{" "}
              (~${usdFee})
            </div>
          )}
          {user.address && user.id && !isSwapAmountEmpty && (
            <div className="bridge_transfer_fee">
              {transfer.type === "withdraw" && (
                <x.div>
                  {L2Fee && (
                    <>
                      {fromNetwork.from.key === "zksync" && `zkSync L2 gas fee: ~${L2Fee} ${L2FeeToken}`}
                    </>
                  )}
                  {!L2Fee && (
                    <div style={{ display: "inline-flex", margin: "0 5px" }}>
                      <Loader
                        type="TailSpin"
                        color="#444"
                        height={16}
                        width={16}
                      />
                    </div>
                  )}

                  {transfer.type === "withdraw" && toNetwork.key === "ethereum" && (
                    <x.div>
                      {isFastWithdraw() && L1Fee && (
                        <div>
                          Ethereum L1 gas + bridge fee: ~{formatPrice(L1Fee)}{" "}
                          {swapDetails.currency}
                        </div>
                      )}
                      <x.div color={"blue-gray-300"}>
                        You'll receive:
                        {isFastWithdraw()?' ~':' '}
                        {isFastWithdraw() && L1Fee
                          ? formatPrice(swapDetails.amount - L1Fee)
                          : formatPrice(swapDetails.amount)}
                        {" " + swapDetails.currency} on Ethereum L1
                      </x.div>
                    </x.div>
                  )}
                </x.div>
              )}
              {transfer.type === "deposit" && (
                <x.div>
                  {L1Fee && (
                    <>
                     {fromNetwork.from.key === "polygon" && `Polygon gas fee: ~${formatPrice(L1Fee)} MATIC`}
                     {fromNetwork.from.key === "ethereum" && `Gas fee: ~${formatPrice(L1Fee)} ETH`}
                    </>
                  )}
                  {!L1Fee && !hasError && (
                    <div style={{ display: "inline-flex", margin: "0 5px" }}>
                      <Loader
                        type="TailSpin"
                        color="#444"
                        height={16}
                        width={16}
                      />
                    </div>
                  )}
                  {transfer.type === "deposit" && (
                    <x.div>
                      <x.div color={"blue-gray-300"}>
                      You'll receive: 
                        {fromNetwork.from.key === "polygon" && ` ~${formatPrice(swapDetails.amount)}`}
                        {toNetwork.key === "polygon" && ` ~${formatPrice(swapDetails.amount)}`}
                        {fromNetwork.from.key === "ethereum" && toNetwork.key === "zksync" && ` ${formatPrice(swapDetails.amount)}`}

                        {fromNetwork.from.key === "polygon" && ` ETH on zkSync L2`}
                        {toNetwork.key === "polygon" && ` WETH on Polygon`}
                        {fromNetwork.from.key === "ethereum" && toNetwork.key === "zksync" && ` ${swapDetails.currency} on zkSync L2`}
                      </x.div>
                    </x.div>
                  )}
                </x.div>
              )}
            </div>
          )}

          {!user.address && !polygonLoding && (
            <div className="bridge_transfer_fee">
              🔗 &nbsp;Please connect your wallet
            </div>
          )}

          <div className="bridge_button">
            {!user.address && <ConnectWalletButton isLoading={polygonLoding} />}
            {user.address && (
              <>
                {balances[swapDetails.currency] && !hasAllowance && !hasError 
                && fromNetwork.from.key !== "polygon" &&(
                  <Button
                    loading={isApproving}
                    className={cx("bg_btn", {
                      zig_disabled:
                        formErr.length > 0 || 
                        Number(swapDetails.amount) === 0 || 
                        swapDetails.currency === "ETH",
                    })}
                    text="APPROVE"
                    style={{ marginBottom: 10 }}
                    onClick={approveSpend}
                  />
                )}
                {hasError && (
                  <Button
                    className="bg_btn zig_btn_disabled bg_err"
                    text={formErr}
                    icon={<BiError />}
                  />
                )}
                {!hasError && (
                  <Button
                    loading={loading}
                    className={cx("bg_btn", {
                      zig_disabled:
                        formErr.length > 0 ||
                        (L2Fee === null && L1Fee === null) ||
                        !hasAllowance ||
                        Number(swapDetails.amount) === 0,
                    })}
                    text="TRANSFER"
                    icon={<MdSwapCalls />}
                    onClick={doTransfer}
                  />                  
                )}
              </>
            )}
          </div>
        </Pane>
      </div>
      {user.address ? (
        <div className="bridge_connected_as">
          <span className="bridge_bubble_connected" /> Connected as{" "}
          {`${user.address.substr(0, 6)}...${user.address.substr(-5)}`}
          <span
            onClick={() => api.signOut().catch((err) => console.log(err))}
            className="bridge_disconnect"
          >
            {" • "}
            <a href="#disconnect">Disconnect</a>
          </span>
        </div>
      ) : (
        <div className="bridge_connected_as">
          <span className="bridge_bubble_disconnected" />
          Disconnected
        </div>
      )}
      
    </>
  );
};

export default Bridge;
