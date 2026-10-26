import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '../core/api';

type ReturnItem = { item_id:number; order_id:number; contract_code:string; customer_name:string; vehicle_name:string; license:string; scheduled_return_at:string|null; completed_at:string|null; item_revision:string; order_revision:string; total_amount:number|null; paid_amount:number|null; daily_price:number|null; deposit_held:number };
type LineInput = { fee?:string; discount?:string; repair?:string; repairNote?:string };
const nowLocal = () => new Date(Date.now()+7*3600000).toISOString().slice(0,16);
const localMs = (value:string) => new Date(`${value}:00+07:00`).getTime();
const money = (value:number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;

export function ContractReturnWorkflow({ onClose, onDone }: { onClose:()=>void; onDone:()=>void }) {
  const [query,setQuery]=useState('');
  const [rows,setRows]=useState<ReturnItem[]>([]);
  const [picked,setPicked]=useState<number[]>([]);
  const [lines,setLines]=useState<Record<number,LineInput>>({});
  const [returnedAt,setReturnedAt]=useState(nowLocal);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const request=useRef(0);
  const load=useCallback(async(term:string)=>{
    const seq=++request.current;
    setLoading(true);setError('');
    try { const result=await apiGet<ReturnItem[]>(`/returns?${new URLSearchParams({query:term})}`); if(seq===request.current){setRows(result);setPicked([]);setLines({});} }
    catch(cause){if(seq===request.current)setError(cause instanceof Error?cause.message:'Không tải được xe cần trả.');}
    finally{if(seq===request.current)setLoading(false);}
  },[]);
  useEffect(()=>{if(query.trim().length<2){setRows([]);setError('');return;}timer.current&&clearTimeout(timer.current);timer.current=setTimeout(()=>void load(query.trim()),350);return()=>{if(timer.current)clearTimeout(timer.current);};},[query,load]);
  const selected=useMemo(()=>rows.filter(row=>picked.includes(row.item_id)&&!row.completed_at),[rows,picked]);
  const submit=async()=>{
    if(!selected.length)return;
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnedAt)||!Number.isFinite(localMs(returnedAt))||localMs(returnedAt)>Date.now()+5*60000){setError('Thời gian trả xe không hợp lệ hoặc nằm trong tương lai.');return;}
    for(const row of selected){const value=lines[row.item_id]||{};if(Number(value.repair)>0&&!value.repairNote?.trim()){setError(`Nhập nội dung sửa chữa cho xe ${row.license}.`);return;}}
    setSaving(true);setError('');
    try{
      const items=selected.map(row=>({item_id:row.item_id,item_revision:row.item_revision,returned_at:returnedAt,hourly_rate:'20000',...(lines[row.item_id]?.fee!==undefined?{fee_override:lines[row.item_id].fee}:{}),...(lines[row.item_id]?.discount!==undefined?{early_discount:lines[row.item_id].discount}:{}),...(lines[row.item_id]?.repair!==undefined?{repair_fee:lines[row.item_id].repair,repair_note:lines[row.item_id]?.repairNote||''}:{})}));
      await apiPost('/returns',{items});
      Alert.alert('Đã ghi nhận trả xe',`Đã xử lý ${selected.length} xe. Mở hợp đồng để kiểm tra thu phí, công nợ và hoàn cọc nếu cần.`,[{text:'Đóng',onPress:onDone}]);
    }catch(cause){setError(cause instanceof Error?cause.message:'Không ghi nhận được trả xe.');}
    finally{setSaving(false);}
  };
  const update=(id:number,key:keyof LineInput,value:string)=>setLines(current=>({...current,[id]:{...current[id],[key]:value.replace(/\D/g,'').slice(0,13)}}));
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.root} edges={['top','left','right','bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={styles.header}><View><Text style={styles.title}>Trả xe</Text><Text style={styles.subtitle}>Tìm theo mã hợp đồng, tên khách hoặc biển số</Text></View><Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.close}>Đóng</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput style={styles.input} placeholder="Ví dụ: 59A1-12345" value={query} onChangeText={setQuery} autoCapitalize="characters" returnKeyType="search" />
          <Text style={styles.label}>Thời gian trả thực tế (giờ Việt Nam)</Text><TextInput style={styles.input} value={returnedAt} onChangeText={setReturnedAt} placeholder="YYYY-MM-DDTHH:mm" />
          {loading?<ActivityIndicator style={styles.status}/>:null}
          {error?<Text style={styles.error}>{error}</Text>:null}
          {query.trim().length<2?<Text style={styles.hint}>Nhập ít nhất 2 ký tự để tìm xe trong hợp đồng.</Text>:null}
          {rows.map(row=>{
            const active=!row.completed_at,checked=picked.includes(row.item_id),scheduled=row.scheduled_return_at?new Date(row.scheduled_return_at).getTime():NaN,ret=localMs(returnedAt),minutes=Number.isFinite(scheduled)&&Number.isFinite(ret)?Math.max(Math.ceil((ret-scheduled)/60000),0):0;
            return <View key={row.item_id} style={styles.card}>
              <Pressable disabled={!active} style={styles.rowHead} onPress={()=>setPicked(current=>checked?current.filter(id=>id!==row.item_id):[...current,row.item_id])}>
                <View style={[styles.check,checked&&styles.checkOn]}><Text style={styles.checkText}>{checked?'✓':''}</Text></View>
                <View style={styles.flex}><Text style={styles.vehicle}>{row.vehicle_name} · {row.license}</Text><Text style={styles.meta}>{row.contract_code} · {row.customer_name}</Text><Text style={styles.meta}>{active?'Hạn trả: ': 'Đã trả · '}{row.scheduled_return_at?new Date(row.scheduled_return_at).toLocaleString('vi-VN'):'—'}</Text></View>
              </Pressable>
              {!active?<Text style={styles.hint}>Xe này đã trả.</Text>:checked?<View style={styles.adjustments}>
                {minutes>0?<Text style={styles.meta}>Đang quá hạn {Math.floor(minutes/60)} giờ; phí gợi ý được xử lý theo quy tắc web.</Text>:Number.isFinite(scheduled)&&ret<scheduled?<Text style={styles.meta}>Xe trả sớm; có thể nhập giảm tiền thuê thực tế.</Text>:<Text style={styles.meta}>Trả đúng hạn hoặc chưa có hạn trả hợp lệ.</Text>}
                {minutes>0?<Field label="Phí quá hạn thực tế (VNĐ) — bỏ trống để tính tự động" value={lines[row.item_id]?.fee} onChange={value=>update(row.item_id,'fee',value)}/>:null}
                {Number.isFinite(scheduled)&&ret<scheduled?<Field label="Giảm tiền thuê khi trả sớm (VNĐ)" value={lines[row.item_id]?.discount} onChange={value=>update(row.item_id,'discount',value)}/>:null}
                <Field label="Phí sửa chữa (VNĐ)" value={lines[row.item_id]?.repair} onChange={value=>update(row.item_id,'repair',value)}/>
                {Number(lines[row.item_id]?.repair)>0?<TextInput style={styles.input} placeholder="Nội dung hư hỏng / sửa chữa" value={lines[row.item_id]?.repairNote||''} onChangeText={value=>setLines(current=>({...current,[row.item_id]:{...current[row.item_id],repairNote:value.slice(0,1000)}}))}/>:null}
              </View>:null}
            </View>;
          })}
          {selected.length?<View style={styles.summary}><Text style={styles.summaryTitle}>Đã chọn {selected.length} xe</Text><Text style={styles.meta}>Tiền cọc đang giữ được giữ nguyên ở bước ghi nhận trả xe. Đối chiếu khoản thu, công nợ và hoàn cọc trong luồng tài chính của hợp đồng.</Text></View>:null}
        </ScrollView>
        <View style={styles.footer}><Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Hủy</Text></Pressable><Pressable disabled={!selected.length||saving||loading} style={[styles.submit,(!selected.length||saving||loading)&&styles.disabled]} onPress={()=>void submit()}>{saving?<ActivityIndicator color="#fff"/>:<Text style={styles.submitText}>Xác nhận trả {selected.length||''} xe</Text>}</Pressable></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function Field({label,value,onChange}:{label:string;value?:string;onChange:(value:string)=>void}){return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value||''} onChangeText={onChange} keyboardType="number-pad" placeholder="0"/></View>}

const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#fafafa'},flex:{flex:1},header:{paddingHorizontal:20,paddingTop:12,paddingBottom:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#ececec'},title:{fontSize:27,fontWeight:'800',color:'#171717'},subtitle:{fontSize:12,color:'#737373',marginTop:4},close:{fontSize:15,fontWeight:'700',color:'#e3262e'},content:{padding:20,paddingBottom:28},input:{minHeight:48,borderRadius:13,borderWidth:1,borderColor:'#dedede',backgroundColor:'#fff',paddingHorizontal:14,color:'#171717',fontSize:15,marginBottom:12},label:{fontSize:13,fontWeight:'700',color:'#525252',marginBottom:7},status:{margin:16},error:{color:'#a1161d',fontSize:14,marginVertical:10},hint:{color:'#737373',fontSize:13,lineHeight:19,marginTop:7},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ececec',borderRadius:16,padding:14,marginTop:11},rowHead:{flexDirection:'row',gap:11,alignItems:'flex-start'},check:{width:22,height:22,borderRadius:7,borderWidth:1,borderColor:'#bdbdbd',alignItems:'center',justifyContent:'center'},checkOn:{backgroundColor:'#e3262e',borderColor:'#e3262e'},checkText:{color:'#fff',fontWeight:'800'},vehicle:{fontSize:15,fontWeight:'800',color:'#171717'},meta:{fontSize:12,color:'#737373',lineHeight:18,marginTop:4},adjustments:{borderTopWidth:1,borderTopColor:'#eee',marginTop:13,paddingTop:12},field:{marginTop:10},summary:{backgroundColor:'#fff5f5',borderRadius:14,padding:15,marginTop:15},summaryTitle:{fontSize:15,fontWeight:'800',color:'#171717'},footer:{flexDirection:'row',gap:10,padding:16,borderTopWidth:1,borderTopColor:'#ececec',backgroundColor:'#fff'},cancel:{height:48,flex:1,borderRadius:13,borderWidth:1,borderColor:'#ddd',alignItems:'center',justifyContent:'center'},cancelText:{fontWeight:'700',color:'#525252'},submit:{height:48,flex:2,borderRadius:13,backgroundColor:'#e3262e',alignItems:'center',justifyContent:'center'},submitText:{fontWeight:'800',color:'#fff',fontSize:15},disabled:{opacity:.45}});
