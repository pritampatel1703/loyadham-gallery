/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    navy: '#0C3C67',
                    light: '#F5F5F5',
                    gold: '#C5A059',
                    charcoal: '#2D3748',
                }
            },
            fontFamily: {
                sans: ['Roboto', 'sans-serif'],
            },
            backgroundImage: {
                'traditional-pattern': "url('/assets/pattern.png')",
            }
        },
    },
    plugins: [],
}
