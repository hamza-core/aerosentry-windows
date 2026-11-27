using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122104233_AddDetectionEvents : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "DetectionEvents",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WallId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CellId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                CellLabel = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                Probability = table.Column<double>(type: "float", nullable: false),
                Threshold = table.Column<double>(type: "float", nullable: false),
                FrameNumber = table.Column<int>(type: "int", nullable: false),
                TimestampSeconds = table.Column<double>(type: "float", nullable: false),
                MlSessionId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                DetectedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_DetectionEvents", x => x.Id);
                table.ForeignKey(
                    name: "FK_DetectionEvents_Walls_WallId",
                    column: x => x.WallId,
                    principalTable: "Walls",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_DetectionEvents_WallId_DetectedAtUtc",
            table: "DetectionEvents",
            columns: new[] { "WallId", "DetectedAtUtc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "DetectionEvents");
    }
}
