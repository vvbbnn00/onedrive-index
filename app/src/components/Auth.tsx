"use client";
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'

import Image from 'next/image'
import {useRouter} from 'next/router'
import {FC, FormEvent, useState} from 'react'
import {useTranslation} from 'next-i18next'

const Auth: FC<{ authTokenPath: string }> = ({authTokenPath}) => {
    const router = useRouter()
    const {t} = useTranslation()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const updateToken = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        const token = formData.get('token') as string
        const path = formData.get('path') as string
        if (token === '') return
        if (path === '') return
        setLoading(true)
        const dataToSend = {
            token: token,
            path: path,
        }
        fetch('/api/verify/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataToSend),
        })
            .then((response) => {
                if (response.ok) {
                    router.reload()
                    return;
                }
                if (response.status === 401) {
                    setError('Failed.WrongPassword')
                    return;
                }
                setError('Request Failed')
            })
            .catch((error) => {
                setError(error.toString())
            })
            .finally(() => {
                setLoading(false)
            })
    }

    return (
        <div className="mx-auto flex max-w-sm flex-col space-y-4 md:my-10">
            <div className="mx-auto w-3/4 md:w-5/6">
                <Image src={'/images/fabulous-wapmire-weekdays.png'} alt="authenticate" width={912} height={912}
                       priority/>
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('Enter Password')}</div>

            <p className="text-sm font-medium text-gray-500">
                {t('This route (the folder itself and the files inside) is password protected. ') +
                    t('If you know the password, please enter it below.')}
            </p>

            <form className="flex items-center space-x-2" onSubmit={updateToken}>
                <input defaultValue={authTokenPath} type="hidden" name={'path'}/>
                <input
                    className="flex-1 rounded border border-gray-600/10 p-2 font-mono focus:outline-none focus:ring focus:ring-blue-300 dark:bg-gray-600 dark:text-white dark:focus:ring-blue-700"
                    autoFocus
                    autoComplete='password'
                    type="password"
                    placeholder="************"
                    name={'token'}
                    required={true}
                />
                <button
                    className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 focus:outline-none focus:ring focus:ring-blue-400"
                    type='submit'
                    disabled={loading}
                >
                    <FontAwesomeIcon icon="arrow-right"/>
                </button>
            </form>

            <div className="text-sm font-medium text-gray-500">
                {error && (
                    <div className="text-red-500 text-sm">{t(error)}</div>
                )}
            </div>
        </div>
    )
}

export default Auth
