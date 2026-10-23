import {redirect} from 'next/navigation';
import Platform from './platform';
import {requireMember} from '@/lib/auth';
import {AccessError} from '@/lib/api-guard';
export const dynamic='force-dynamic';
export default async function Home(){let user;try{user=await requireMember()}catch(error){if(error instanceof AccessError)redirect('/login?reason='+error.status);throw error}return <Platform displayName={user.displayName}/>;}
