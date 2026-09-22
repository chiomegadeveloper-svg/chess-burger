import type {ImgHTMLAttributes} from 'react';
import './currency.css';

export const CBG_ICON='/currency/cbg-coin.webp';

export function cbgTier(value:number){
 const amount=Math.max(0,Number(value)||0);
 if(amount>=20_000)return 'LYDIAN';
 if(amount>=10_000)return 'CROESEID';
 if(amount>=5_000)return 'DARIC';
 return 'CBG';
}

export function formatCbg(value:number){
 const amount=Math.max(0,Math.floor(Number(value)||0));
 return `${amount.toLocaleString()} ${cbgTier(amount)}`;
}

export function CbgIcon(props:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'>){
 return <img {...props} width={props.width??64} height={props.height??64} src={CBG_ICON} alt={props.alt??'Chess Burger Gold coin'}/>;
}
