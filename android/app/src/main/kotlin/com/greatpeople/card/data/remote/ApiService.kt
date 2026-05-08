package com.greatpeople.card.data.remote

import com.greatpeople.card.data.model.Card
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class LoginRequest(val email: String, val password: String)
data class RegisterRequest(val email: String, val password: String, val displayName: String)
data class GoogleLoginRequest(val idToken: String)
data class AuthResponse(val accessToken: String, val refreshToken: String)
data class CardSyncRequest(val cards: List<Card>)
data class CardSyncResponse(val cards: List<Card>)

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): AuthResponse

    @POST("auth/google")
    suspend fun googleLogin(@Body request: GoogleLoginRequest): AuthResponse

    @POST("auth/logout")
    suspend fun logout()

    @GET("profile/cards")
    suspend fun getCards(): CardSyncResponse

    @POST("profile/cards/sync")
    suspend fun syncCards(@Body request: CardSyncRequest): CardSyncResponse
}
