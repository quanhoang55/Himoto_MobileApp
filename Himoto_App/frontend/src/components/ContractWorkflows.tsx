import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet, apiPost, type User } from '../core/api';
import type { ListResult, MobileContractDraft, RecordItem } from '../core/models';
import { can } from '../core/session';

type Mode = 'reservation' | 'backfill' | 'renewal';
type WorkflowKind = 'forgotten-contract' | 'renewal' | 'payment';
type Account = { id: number; label: string; kind: 'cash' | 'bank'; owner_type: string; store_id: number };
type PaymentContext = { id: number; code: string; status: string; store_id: number; revision: string; total_amount: number | null; paid_amount: number | null; remaining: number | null; accounts: Account[]; items: { id: number; name: string; license: string; revision: string; return_at: string | null; renewal_amount: number | null; daily_price?: number | null; completed_at?: string | null }[] };
type RenewalItem = { id: number; name: string; license: string; revision: string; returnAt: string | null; completedAt: string | null };
type Store = { id: number; name: string };
type Customer = { id: number; name: string; phone?: string };

const localAt = (offset = 0) => new Date(Date.now() + offset + 7 * 3600000).toISOString().slice(0, 16);
const localNow = () => localAt();
const requestId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => { const n = Math.floor(Math.random() * 16); return (token === 'x' ? n : (n & 3) | 8).toString(16); });
const METHODS = [{ value: 'cash', label: 'Tiền mặt' }, { value: 'transfer', label: 'CK cá nhân' }, { value: 'company_transfer', label: 'CK công ty' }] as const;

export function ContractWorkflows({ mode, user, onClose, onDone }: { mode: Mode; user: User | null; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<WorkflowKind | null>(mode === 'reservation' ? 'forgotten-contract' : null);
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.root} edges={['top','left','right','bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}><Text style={styles.title}>{mode === 'reservation' ? 'Nhận cọc giữ xe' : mode === 'renewal' ? 'Gia hạn hợp đồng' : kind ? kind === 'forgotten-contract' ? 'Nhập hợp đồng bị quên' : kind === 'renewal' ? 'Nhập bổ sung gia hạn' : 'Nhập bổ sung thu / chi' : 'Nhập bổ sung giao dịch'}</Text><Pressable onPress={onClose}><Text style={styles.close}>Đóng</Text></Pressable></View>
        {mode === 'renewal' ? <DirectRenewalFlow onDone={onDone} /> : mode === 'backfill' && !kind ? <View style={styles.menu}>{[
          ['forgotten-contract','Hợp đồng bị quên chưa nhập','Tạo hồ sơ và ghi nhận lịch sử thuê thực tế.'],['renewal','Lượt gia hạn bị quên chưa nhập','Bổ sung ngày gia hạn, phí và khoản đã thu nếu có.'],['payment','Khoản thu / chi của hợp đồng đã có','Ghi giao dịch thực tế còn thiếu vào sổ.'],
        ].filter(([key]) => key === 'forgotten-contract' ? can(user,'contracts.draft') && can(user,'contracts.finalize') : key === 'renewal' ? can(user,'contracts.read') && can(user,'contracts.renew') : can(user,'contracts.read') && can(user,'finance.write')).map(([key,title,detail]) => <Pressable key={key} style={styles.menuCard} onPress={() => setKind(key as WorkflowKind)}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.hint}>{detail}</Text></Pressable>)}</View>
          : kind === 'forgotten-contract' ? <NewContractFlow mode={mode} user={user} onDone={onDone} />
          : kind ? <ExistingTransactionFlow kind={kind} onDone={onDone} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

type DirectRenewalItem = { id:number; name:string; license:string; returnAt:string|null; completedAt:string|null; revision:string; renewalAmount:number };
const localDateTime = (value:string|null) => value ? new Date(new Date(value).getTime()+7*3600000).toISOString().slice(0,16) : '';
const addDuration = (value:string,count:number,unit:'day'|'hour') => {
  const base=new Date(`${value}:00+07:00`).getTime();
  return Number.isFinite(base)?localDateTime(new Date(base+(unit==='day'?count*86400000:count*3600000)).toISOString()):'';
};

function DirectRenewalFlow({onDone}:{onDone:()=>void}) {
  const [search,setSearch]=useState(''),[contracts,setContracts]=useState<RecordItem[]>([]),[context,setContext]=useState<PaymentContext|null>(null),[items,setItems]=useState<DirectRenewalItem[]>([]),[item,setItem]=useState<DirectRenewalItem|null>(null);
  const [unit,setUnit]=useState<'day'|'hour'>('day'),[count,setCount]=useState('1'),[returnAt,setReturnAt]=useState(''),[amount,setAmount]=useState('0'),[rate,setRate]=useState(''),[note,setNote]=useState('');
  const [collected,setCollected]=useState(false),[method,setMethod]=useState<'cash'|'transfer'|'company_transfer'>('cash'),[accountId,setAccountId]=useState(''),[paidAt,setPaidAt]=useState(localNow());
  const [loading,setLoading]=useState(false),[error,setError]=useState('');const requestIdRef=useRef(requestId()),requestPayloadRef=useRef('');
  const find=async()=>{setError('');try{const result=await apiGet<ListResult<RecordItem>>(`/contracts?search=${encodeURIComponent(search)}&size=30`);setContracts(result.items.filter(row=>['renting','overdue','wait_payment'].includes(row.status)));}catch(cause){setError(cause instanceof Error?cause.message:'Không tìm được hợp đồng.');}};
  const chooseContract=async(row:RecordItem)=>{setLoading(true);setError('');setContext(null);setItem(null);requestIdRef.current=requestId();try{const [ctx,renewals]=await Promise.all([apiGet<PaymentContext>(`/contracts/${row.id}/payments`),apiGet<{items:DirectRenewalItem[]}>(`/contracts/${row.id}/renewals`)]);setContext(ctx);const open=renewals.items.filter(value=>!value.completedAt&&value.returnAt);setItems(open);if(open.length===1){setItem(open[0]);setReturnAt(localDateTime(open[0].returnAt));}}catch(cause){setError(cause instanceof Error?cause.message:'Không tải được hợp đồng để gia hạn.');}finally{setLoading(false);}};
  const accounts=context?.accounts.filter(row=>method==='cash'?row.kind==='cash':row.kind==='bank'&&(method==='company_transfer'?row.owner_type==='company':row.owner_type!=='company')&&(method==='company_transfer'||row.store_id===context.store_id))||[];
  const selectItem=(next:DirectRenewalItem)=>{setItem(next);setReturnAt(localDateTime(next.returnAt));setCount('1');setRate(String(next?context?.items.find(value=>value.id===next.id)?.daily_price||'':''));setAmount('0');requestIdRef.current=requestId();};
  const updateDuration=(nextCount:string,nextUnit=unit)=>{setCount(nextCount);const n=Number(nextCount);if(item&&n>0&&n<=(nextUnit==='day'?365:720)&&item.returnAt)setReturnAt(addDuration(localDateTime(item.returnAt),n,nextUnit));if(/^\d+$/.test(rate)&&n>0)setAmount(String(Number(rate)*n));};
  const changeUnit=(nextUnit:'day'|'hour')=>{setUnit(nextUnit);const nextRate=nextUnit==='hour'?'20000':String(context?.items.find(value=>value.id===item?.id)?.daily_price||'');setRate(nextRate);const n=Number(count||1);setAmount(nextRate?String(Number(nextRate)*n):'0');const max=nextUnit==='day'?365:720;if(item?.returnAt&&n>0&&n<=max)setReturnAt(addDuration(localDateTime(item.returnAt),n,nextUnit));};
  const submit=async()=>{if(!context||!item)return;const fee=Number(amount);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnAt)||!Number.isSafeInteger(fee)||fee<0||fee>9999999999999||!Number.isFinite(new Date(`${returnAt}:00+07:00`).getTime())){setError('Kiểm tra ngày hẹn trả mới và phí gia hạn.');return;}if(!item.returnAt||new Date(`${returnAt}:00+07:00`).getTime()<=new Date(item.returnAt).getTime()){setError('Ngày trả mới phải sau ngày hẹn trả hiện tại.');return;}if(fee>0&&collected&&(!accountId||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(paidAt))){setError('Chọn tài khoản nhận tiền và thời điểm thu.');return;}
    const payload={item_id:item.id,item_revision:item.revision,order_revision:context.revision,return_at:returnAt,amount:String(fee),note:note.trim(),...(fee>0&&collected?{receipt:{method,account_id:Number(accountId),paid_at:paidAt}}:{})};const fingerprint=JSON.stringify(payload);if(requestPayloadRef.current!==fingerprint){requestIdRef.current=requestId();requestPayloadRef.current=fingerprint;}
    setLoading(true);setError('');try{await apiPost(`/contracts/${context.id}/renewals`,{...payload,request_id:requestIdRef.current});onDone();}catch(cause){setError(cause instanceof Error?cause.message:'Không lưu được gia hạn. Kiểm tra hợp đồng trước khi thử lại.');}finally{setLoading(false);}};
  return <ScrollView style={styles.root} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    {!context?<><Text style={styles.hint}>Tìm hợp đồng đang thuê để gia hạn trực tiếp. Hợp đồng thuê sở hữu theo lịch đóng tiền không hỗ trợ luồng này.</Text><Text style={styles.label}>Tìm hợp đồng</Text><View style={styles.searchRow}><TextInput style={styles.input} value={search} placeholder="Mã, biển số, tên khách hoặc số điện thoại" onChangeText={setSearch}/><Pressable style={styles.secondaryButton} onPress={()=>void find()}><Text style={styles.secondaryText}>Tìm</Text></Pressable></View>{contracts.map(row=><Choice key={row.id} label={`${row.code||`#${row.id}`} · ${row.customerName||row.name} · ${row.status}`} selected={false} onPress={()=>void chooseContract(row)}/>)}</>
    :<>
      <Text style={styles.hint}>{context.code} · {context.status} · Tiền thuê {context.total_amount==null?'—':`${context.total_amount.toLocaleString('vi-VN')} ₫`} · Đã thu {context.paid_amount==null?'—':`${context.paid_amount.toLocaleString('vi-VN')} ₫`}</Text>
      <Text style={styles.label}>Xe cần gia hạn</Text>{items.length?items.map(row=><Choice key={row.id} label={`${row.license||row.name} · Hạn hiện tại ${localDateTime(row.returnAt).replace('T',' ')}`} selected={item?.id===row.id} onPress={()=>selectItem(row)}/>):<Text style={styles.hint}>Hợp đồng không còn xe đang thuê để gia hạn.</Text>}
      {item?<>
        <Text style={styles.label}>Gia hạn theo</Text><View style={styles.row}><Choice label="Ngày" selected={unit==='day'} onPress={()=>changeUnit('day')}/><Choice label="Giờ" selected={unit==='hour'} onPress={()=>changeUnit('hour')}/></View>
        <Field label={`Số ${unit==='day'?'ngày':'giờ'} gia hạn`} value={count} set={updateDuration} keyboard="numeric"/>
        <Field label={`Đơn giá / ${unit==='day'?'ngày':'giờ'} (VNĐ)`} value={rate} set={value=>{setRate(value);if(/^\d+$/.test(value))setAmount(String(Number(value)*Number(count||1)));}} keyboard="numeric"/>
        <Field label="Ngày hẹn trả mới · YYYY-MM-DDTHH:mm" value={returnAt} set={setReturnAt}/>
        <Field label="Phí gia hạn (VNĐ, có thể 0)" value={amount} set={setAmount} keyboard="numeric"/>
        <Field label="Ghi chú / thỏa thuận (không bắt buộc)" value={note} set={setNote} multiline/>
        {Number(amount)>0?<><Text style={styles.label}>Tình trạng thu tiền</Text><Choice label="Chưa thu · ghi công nợ gia hạn" selected={!collected} onPress={()=>setCollected(false)}/><Choice label="Đã nhận tiền · ghi phiếu thu cùng lúc" selected={collected} onPress={()=>setCollected(true)}/>
          {collected?<><Text style={styles.label}>Hình thức nhận tiền</Text><View style={styles.row}>{METHODS.map(option=><Choice key={option.value} label={option.label} selected={method===option.value} onPress={()=>{setMethod(option.value);setAccountId('');}}/>)}</View><Text style={styles.label}>Tài khoản nhận</Text>{accounts.map(row=><Choice key={row.id} label={row.label} selected={accountId===String(row.id)} onPress={()=>setAccountId(String(row.id))}/>) }<Field label="Ngày giờ nhận tiền · YYYY-MM-DDTHH:mm" value={paidAt} set={setPaidAt}/></>:null}
        </>:null}
        <Pressable style={styles.primaryButton} disabled={loading} onPress={()=>void submit()}><Text style={styles.primaryText}>{loading?'Đang lưu…':collected&&Number(amount)>0?'Lưu gia hạn và thu tiền':'Lưu gia hạn'}</Text></Pressable>
      </>:null}
      <Pressable style={styles.secondaryButton} onPress={()=>{setContext(null);setItems([]);setItem(null);setError('');}}><Text style={styles.secondaryText}>Chọn hợp đồng khác</Text></Pressable>
    </>}
    {loading?<Text style={styles.hint}>Đang xử lý…</Text>:null}{error?<Text style={styles.error}>{error}</Text>:null}
  </ScrollView>;
}

function NewContractFlow({ mode, user, onDone }: { mode: Mode; user: User | null; onDone: () => void }) {
  const backfill = mode === 'backfill';
  const [stores,setStores]=useState<Store[]>([]),[storeId,setStoreId]=useState('');
  const [customerQuery,setCustomerQuery]=useState(''),[customers,setCustomers]=useState<Customer[]>([]),[customer,setCustomer]=useState<Customer|null>(null);
  const [vehicleQuery,setVehicleQuery]=useState(''),[vehicles,setVehicles]=useState<RecordItem[]>([]),[vehicle,setVehicle]=useState<RecordItem|null>(null);
  const [start,setStart]=useState(localAt(backfill?-86400000:300000)),[end,setEnd]=useState(localAt(backfill?0:86400000+300000)),[total,setTotal]=useState(''),[received,setReceived]=useState('');
  const [returnedAt,setReturnedAt]=useState(''),[backfillNote,setBackfillNote]=useState('');
  const [accounts,setAccounts]=useState<Account[]>([]),[method,setMethod]=useState<'cash'|'transfer'|'company_transfer'>('transfer'),[accountId,setAccountId]=useState(''),[paidAt,setPaidAt]=useState(localNow());
  const [saved,setSaved]=useState<MobileContractDraft|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const requestIdRef=useRef(requestId());
  useEffect(()=>{void apiGet<{stores:Store[]}>('/bootstrap').then(result=>{const allowed=user?.scope_all?result.stores:result.stores.filter(s=>s.id===user?.store_id);setStores(allowed);setStoreId(allowed[0]?String(allowed[0].id):'');}).catch(cause=>setError(cause instanceof Error?cause.message:'Không tải được cơ sở.'));},[user]);
  const findCustomers=async()=>{try{const result=await apiGet<ListResult<Customer>>(`/customers?search=${encodeURIComponent(customerQuery)}&size=20`);setCustomers(result.items);}catch(cause){setError(cause instanceof Error?cause.message:'Không tìm được khách hàng.');}};
  const findVehicles=async()=>{try{const result=await apiGet<ListResult<RecordItem>>(`/vehicles?search=${encodeURIComponent(vehicleQuery)}&size=30`);setVehicles(backfill?result.items:result.items.filter(item=>item.status==='ready'||item.available));}catch(cause){setError(cause instanceof Error?cause.message:'Không tìm được xe.');}};
  const loadAccounts=async(draftId:number)=>{setLoading(true);setError('');try{const context=await apiGet<PaymentContext>(`/contracts/${draftId}/payments`);setAccounts(context.accounts);const first=context.accounts.find(row=>method==='cash'?row.kind==='cash':row.kind==='bank'&&(method==='company_transfer'?row.owner_type==='company':row.owner_type!=='company'));setAccountId(first?String(first.id):'');}catch(cause){setError(cause instanceof Error?cause.message:'Không tải được tài khoản nhận tiền.');}finally{setLoading(false);}};
  const createDraft=async()=>{
    if(!customer||!vehicle||!storeId||!/^\d+$/.test(total)||Number(total)<=0){setError('Chọn cơ sở, khách hàng, xe sẵn sàng và nhập tiền thuê dự kiến.');return;}
    if(backfill&&(backfillNote.trim().length<5||returnedAt&&returnedAt<start)){setError('Nhập ngày giờ thực tế hợp lệ và lý do bổ sung ít nhất 5 ký tự.');return;}
    setLoading(true);setError('');
    try{
      const day=localNow().slice(0,10), line={id:String(vehicle.id),name:vehicle.name,license:vehicle.license||'',brand:vehicle.brand||'',type_text:vehicle.type||'',color:vehicle.color||'',year:vehicle.year?String(vehicle.year):'',driver_name:'',driver_license_number:'',driver_license_issued_on:'',borrow_hats:'02',borrow_raincoats:'02',rent_at:'',return_at:''};
      const draft={contract_number:'',signed_on:day,store_id:storeId,vehicle_store_id:storeId,staff_id:'',staff_name:'',customer_id:customer.id,customer:{name:customer.name,phone:customer.phone||'',email:'',address:'',id_card:'',id_card_issued_on:'',id_card_issued_by:'',driver_license_number:'',driver_license_issued_on:'',birthday:'',relatives_text:'',warning_note:'',customer_type:'vietnamese',nationality:'',contact_channel:'',contact_detail:''},vehicles:[line],start_date:start,end_date:end,unit_price:total,total_amount:total,paid_amount:'0',deposit_amount:'0',deposit_paid_amount:'0',package_name:'Theo ngày',payment_method:'',deposit_payment_method:'',collateral_description:'',customer_source:'',customer_source_url:stores.find(s=>String(s.id)===storeId)?.name||'',authorization_date:'',created_on:day,relatives:[],...(backfill?{backfill:{note:backfillNote.trim(),...(returnedAt?{returned_at:returnedAt}:{})}}:{reservation:true})};
      const created=await apiPost<MobileContractDraft>('/contracts/draft',{edits:{status:'draft',rental_type:'daily',notes:'',draft},request_id:requestIdRef.current});
      setSaved(created);
      const context=await apiGet<PaymentContext>(`/contracts/${created.id}/payments`);
      setAccounts(context.accounts);
      const first=context.accounts.find(row=>method==='cash'?row.kind==='cash':row.kind==='bank'&&(method==='company_transfer'?row.owner_type==='company':row.owner_type!=='company'));
      setAccountId(first?String(first.id):'');
      if(!backfill&&!received.trim())setReceived('');
    }catch(cause){setError(cause instanceof Error?cause.message:'Không tạo được hợp đồng nháp.');}
    finally{setLoading(false);}
  };
  const finish=async()=>{
    if(!saved)return;
    if(backfill&&(received&&(!/^\d+$/.test(received)||!accountId)||!backfillNote.trim())){setError('Kiểm tra số tiền thực nhận, tài khoản và lý do bổ sung.');return;}
    if(!backfill&&(!/^[1-9]\d*$/.test(received)||Number(received)>Number(total)||!accountId)){setError('Nhập số tiền giữ xe thực nhận (không vượt tiền thuê dự kiến) và chọn tài khoản.');return;}
    if(backfill&&received&&(!/^[1-9]\d*$/.test(received)||!accountId)){setError('Số tiền thực tế đã thu phải lớn hơn 0 và cần tài khoản nhận.');return;}
    setLoading(true);setError('');
    try{
      const receipts=received? [{purpose:backfill?'rental':'rental',amount:received,method,account_id:Number(accountId),paid_at:paidAt}]:[];
      await apiPost(`/contracts/drafts/${saved.id}/finalize`,{revision:saved.revision,...(backfill?{}:{reservation:true}),receipts});
      onDone();
    }catch(cause){setError(cause instanceof Error?cause.message:'Không xác nhận được hợp đồng. Bản nháp vẫn được giữ để thử lại.');}
    finally{setLoading(false);}
  };
  const availableAccounts=accounts.filter(row=>method==='cash'?row.kind==='cash':row.kind==='bank'&&(method==='company_transfer'?row.owner_type==='company':row.owner_type!=='company')&&(method==='company_transfer'||row.store_id===Number(storeId)));
  return <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    {!saved?<>
      <Text style={styles.hint}>{backfill?'Tạo bản ghi thuê lịch sử. Xác nhận chỉ nhập giao dịch thực tế đã phát sinh; xe đã trả không bị chuyển trạng thái.':'Tạo bản nháp giữ xe trước, sau đó ghi nhận tiền thực nhận và chờ giao xe.'}</Text>
      <Text style={styles.label}>Cơ sở ghi nhận *</Text>{stores.map(store=><Choice key={store.id} label={store.name} selected={storeId===String(store.id)} onPress={()=>setStoreId(String(store.id))}/>)}
      <Text style={styles.label}>Tìm khách hàng *</Text><View style={styles.searchRow}><TextInput style={styles.input} value={customerQuery} placeholder="Tên, số điện thoại" onChangeText={setCustomerQuery}/><Pressable style={styles.secondaryButton} onPress={()=>void findCustomers()}><Text style={styles.secondaryText}>Tìm</Text></Pressable></View>{customers.map(row=><Choice key={row.id} label={`${row.name} · ${row.phone||'Chưa có SĐT'}`} selected={customer?.id===row.id} onPress={()=>setCustomer(row)}/>)}
      <Text style={styles.label}>Tìm xe sẵn sàng *</Text><View style={styles.searchRow}><TextInput style={styles.input} value={vehicleQuery} placeholder="Tên xe hoặc biển số" onChangeText={setVehicleQuery}/><Pressable style={styles.secondaryButton} onPress={()=>void findVehicles()}><Text style={styles.secondaryText}>Tìm</Text></Pressable></View>{vehicles.map(row=><Choice key={row.id} label={`${row.license||row.name} · ${row.name}`} selected={vehicle?.id===row.id} onPress={()=>setVehicle(row)}/>)}
      <Field label={backfill?'Bắt đầu thuê thực tế · YYYY-MM-DDTHH:mm':'Dự kiến nhận xe · YYYY-MM-DDTHH:mm'} value={start} set={setStart}/><Field label={backfill?'Kết thúc / trả thực tế · YYYY-MM-DDTHH:mm':'Hẹn trả · YYYY-MM-DDTHH:mm'} value={end} set={setEnd}/>
      <Field label="Tiền thuê dự kiến (VNĐ) *" value={total} set={setTotal} keyboard="numeric"/>
      {backfill?<><Field label="Ngày giờ trả xe thực tế (để trống nếu còn thuê)" value={returnedAt} set={setReturnedAt}/><Field label="Lý do nhập bổ sung (ít nhất 5 ký tự)" value={backfillNote} set={setBackfillNote} multiline/></>:null}
      <Pressable style={styles.primaryButton} disabled={loading} onPress={()=>void createDraft()}><Text style={styles.primaryText}>{loading?'Đang tạo…':backfill?'Tạo bản nháp lịch sử':'Tạo bản nháp giữ xe'}</Text></Pressable>
    </>:<>
      <Text style={styles.hint}>Bản nháp #{saved.id} đã lưu. Xác nhận bên dưới sẽ ghi nhận trạng thái hợp đồng và các phiếu thu tương ứng.</Text>
      <Field label={backfill?'Tiền thuê thực tế đã thu (để trống nếu chưa thu)':'Tiền giữ xe thực nhận (VNĐ) *'} value={received} set={setReceived} keyboard="numeric"/>
      {received||!backfill?<><Text style={styles.label}>Hình thức nhận</Text><View style={styles.row}>{METHODS.map(option=><Choice key={option.value} label={option.label} selected={method===option.value} onPress={()=>{setMethod(option.value);setAccountId('');}}/> )}</View><Text style={styles.label}>Tài khoản nhận</Text>{availableAccounts.map(account=><Choice key={`${account.kind}-${account.id}`} label={account.label} selected={accountId===String(account.id)} onPress={()=>setAccountId(String(account.id))}/>) }<Field label="Ngày giờ thực nhận · YYYY-MM-DDTHH:mm" value={paidAt} set={setPaidAt}/></>:null}
      {!accounts.length ? <><Text style={styles.hint}>Không có tài khoản nhận đang hoạt động hoặc chưa tải được danh sách.</Text><Pressable style={styles.secondaryButton} disabled={loading} onPress={()=>void loadAccounts(saved.id)}><Text style={styles.secondaryText}>Tải lại tài khoản nhận</Text></Pressable></>:null}
      {error?<Text style={styles.error}>{error}</Text>:null}<Pressable style={styles.primaryButton} disabled={loading} onPress={()=>void finish()}><Text style={styles.primaryText}>{loading?'Đang xác nhận…':backfill?'Xác nhận nhập bổ sung':'Xác nhận đã nhận cọc'}</Text></Pressable>
    </>}
    {error&&!saved?<Text style={styles.error}>{error}</Text>:null}
  </ScrollView>;
}

function ExistingTransactionFlow({ kind, onDone }: { kind: 'renewal'|'payment'; onDone: () => void }) {
  const [search,setSearch]=useState(''),[contracts,setContracts]=useState<RecordItem[]>([]),[context,setContext]=useState<PaymentContext|null>(null),[renewalItems,setRenewalItems]=useState<RenewalItem[]>([]),[item,setItem]=useState<RenewalItem|null>(null);
  const [amount,setAmount]=useState(''),[purpose,setPurpose]=useState<'debt'|'extra'|'deposit'|'deposit_refund'|'rental_refund'>('extra'),[note,setNote]=useState(''),[paidAt,setPaidAt]=useState(localNow()),[occurredAt,setOccurredAt]=useState(localNow()),[returnAt,setReturnAt]=useState(''),[method,setMethod]=useState<'cash'|'transfer'|'company_transfer'>('transfer'),[accountId,setAccountId]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const requestIdRef=useRef(requestId());
  const findContracts=async()=>{try{const result=await apiGet<ListResult<RecordItem>>(`/contracts?search=${encodeURIComponent(search)}&size=20`);setContracts(result.items.filter(row=>!['draft','cancelled'].includes(row.status)));}catch(cause){setError(cause instanceof Error?cause.message:'Không tìm được hợp đồng.');}};
  const selectContract=async(row:RecordItem)=>{setLoading(true);setError('');try{const loaded=await apiGet<PaymentContext>(`/contracts/${row.id}/payments`);setContext(loaded);setAccountId('');if(kind==='renewal'){const result=await apiGet<{items:RenewalItem[]}>(`/contracts/${row.id}/renewals`);setRenewalItems(result.items);}}catch(cause){setError(cause instanceof Error?cause.message:'Không tải được hợp đồng.');}finally{setLoading(false);}};
  const accounts=context?.accounts.filter(row=>method==='cash'?row.kind==='cash':row.kind==='bank'&&(method==='company_transfer'?row.owner_type==='company':row.owner_type!=='company')&&(method==='company_transfer'||row.store_id===context.store_id))||[];
  const submit=async()=>{if(!context)return;setLoading(true);setError('');try{
    if(!confirmed)throw new Error('Xác nhận bạn đã kiểm tra lịch sử và giao dịch thực tế chưa được nhập.');
    if(kind==='payment'){
      if(!/^[1-9]\d{0,12}$/.test(amount)||!accountId||note.trim().length<5)throw new Error('Nhập số tiền, nội dung, tài khoản nhận / chi và kiểm tra lịch sử.');
      await apiPost(`/contracts/${context.id}/payments`,{request_id:requestIdRef.current,revision:context.revision,amount,method,account_id:Number(accountId),paid_at:paidAt,note:note.trim(),...(purpose==='debt'?{}:{purpose})});
    }else{
      if(!item||!returnAt||!/^\d+$/.test(amount||'0')||note.trim().length<5)throw new Error('Chọn xe, ngày trả mới, phí gia hạn và lý do nhập bổ sung.');
      await apiPost(`/contracts/${context.id}/renewals`,{request_id:requestIdRef.current,item_id:item.id,item_revision:item.revision,order_revision:context.revision,return_at:returnAt,amount:amount||'0',note:note.trim(),occurred_at:occurredAt,...(accountId&&Number(amount)>0?{receipt:{method,account_id:Number(accountId),paid_at:paidAt}}:{})});
    }
    onDone();
  }catch(cause){setError(cause instanceof Error?cause.message:'Không lưu được giao dịch. Kiểm tra lịch sử trước khi thử lại.');}finally{setLoading(false);}};
  return <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    {!context?<><Text style={styles.label}>Tìm hợp đồng *</Text><View style={styles.searchRow}><TextInput style={styles.input} value={search} placeholder="Mã, biển số, tên khách, số điện thoại" onChangeText={setSearch}/><Pressable style={styles.secondaryButton} onPress={()=>void findContracts()}><Text style={styles.secondaryText}>Tìm</Text></Pressable></View>{contracts.map(row=><Choice key={row.id} label={`${row.code||`#${row.id}`} · ${row.customerName||row.name}`} selected={false} onPress={()=>void selectContract(row)}/> )}</>
    :<>
      <Text style={styles.hint}>{context.code} · {context.status} · Hợp đồng #{context.id}</Text>
      {kind==='payment'?<>
        <Text style={styles.label}>Nghiệp vụ</Text><View style={styles.row}>{[['debt','Thu công nợ'],['extra','Thu khác'],['deposit','Thu cọc'],['deposit_refund','Trả cọc'],['rental_refund','Hoàn tiền thuê']].map(([value,label])=><Choice key={value} label={label} selected={purpose===value} onPress={()=>setPurpose(value as typeof purpose)}/> )}</View>
        <Field label="Số tiền (VNĐ) *" value={amount} set={setAmount} keyboard="numeric"/><Field label="Thời điểm thực tế · YYYY-MM-DDTHH:mm" value={paidAt} set={setPaidAt}/><Field label="Nội dung giao dịch (ít nhất 5 ký tự)" value={note} set={setNote} multiline/>
      </>:<>
        <Text style={styles.label}>Xe đã thuê *</Text>{renewalItems.map(row=><Choice key={row.id} label={`${row.license||row.name} · ${row.completedAt?'Đã trả':'Đang thuê'}`} selected={item?.id===row.id} onPress={()=>setItem(row)}/>)}
        <Field label="Ngày giờ gia hạn thực tế · YYYY-MM-DDTHH:mm" value={occurredAt} set={setOccurredAt}/><Field label="Ngày hẹn trả mới · YYYY-MM-DDTHH:mm" value={returnAt} set={setReturnAt}/><Field label="Phí gia hạn thực tế (VNĐ, có thể 0)" value={amount} set={setAmount} keyboard="numeric"/><Field label="Lý do nhập bổ sung (ít nhất 5 ký tự)" value={note} set={setNote} multiline/><Field label="Ngày giờ thực nhận (nếu đã thu)" value={paidAt} set={setPaidAt}/>
      </>}
      <Text style={styles.label}>Hình thức thanh toán</Text><View style={styles.row}>{METHODS.map(option=><Choice key={option.value} label={option.label} selected={method===option.value} onPress={()=>{setMethod(option.value);setAccountId('');}}/> )}</View>
      <Text style={styles.label}>Tài khoản {purpose==='deposit_refund'||purpose==='rental_refund'?'chi':'nhận'}</Text>{accounts.map(account=><Choice key={`${account.kind}-${account.id}`} label={account.label} selected={accountId===String(account.id)} onPress={()=>setAccountId(String(account.id))}/>)}
      <Choice label="Tôi đã kiểm tra lịch sử; giao dịch đã thực tế phát sinh và chưa được nhập" selected={confirmed} onPress={()=>setConfirmed(!confirmed)}/>
      <Pressable style={styles.primaryButton} disabled={loading} onPress={()=>void submit()}><Text style={styles.primaryText}>{loading?'Đang lưu…':kind==='payment'?'Ghi nhận giao dịch':'Ghi nhận gia hạn'}</Text></Pressable>
    </>}
    {error?<Text style={styles.error}>{error}</Text>:null}
  </ScrollView>;
}

function Field({label,value,set,keyboard,multiline}:{label:string;value:string;set:(value:string)=>void;keyboard?:'default'|'numeric';multiline?:boolean}) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input,multiline&&styles.multiline]} value={value} onChangeText={set} keyboardType={keyboard||'default'} multiline={multiline} autoCapitalize="none" placeholder={label}/></View>; }
function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}) { return <Pressable accessibilityRole="radio" accessibilityState={{checked:selected}} onPress={onPress} style={[styles.choice,selected&&styles.selected]}><Text style={styles.choiceText}>{label}</Text></Pressable>; }

const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#fafafa'},header:{paddingHorizontal:20,paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{fontSize:23,fontWeight:'800',color:'#171717',flex:1},close:{color:'#e3262e',fontWeight:'700',paddingLeft:12},body:{paddingHorizontal:20,paddingBottom:36},menu:{padding:20,gap:12},menuCard:{backgroundColor:'#fff',borderRadius:15,borderWidth:1,borderColor:'#ececec',padding:16},menuTitle:{fontSize:16,fontWeight:'800',color:'#171717'},hint:{fontSize:14,color:'#737373',lineHeight:21,marginBottom:14},field:{marginBottom:10},label:{fontSize:14,fontWeight:'700',color:'#171717',marginTop:12,marginBottom:7},input:{minHeight:48,borderWidth:1,borderColor:'#d6d6d6',backgroundColor:'#fff',borderRadius:12,paddingHorizontal:13,fontSize:15,color:'#171717',flex:1},multiline:{height:86,textAlignVertical:'top',paddingTop:12},searchRow:{flexDirection:'row',gap:8,alignItems:'center',marginBottom:8},secondaryButton:{backgroundColor:'#fff5f5',borderRadius:11,paddingHorizontal:15,paddingVertical:14},secondaryText:{color:'#e3262e',fontWeight:'700'},choice:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ececec',borderRadius:12,padding:12,marginTop:7},selected:{borderColor:'#e3262e',backgroundColor:'#fff5f5'},choiceText:{color:'#171717',fontSize:14,fontWeight:'600'},row:{flexDirection:'row',flexWrap:'wrap',gap:7},primaryButton:{backgroundColor:'#e3262e',borderRadius:13,alignItems:'center',padding:16,marginTop:18},primaryText:{color:'#fff',fontSize:15,fontWeight:'800'},error:{color:'#8f1414',fontSize:14,marginVertical:12}});
